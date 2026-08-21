import { Router } from "express";
import bcrypt from "bcryptjs";
import { UserModel } from "../models/User";
import { signToken } from "../lib/jwt";
import { authenticate, type AuthRequest } from "../middlewares/authenticate";
import { logger } from "../lib/logger";
import { ensureTenantDatabase } from "../lib/tenantDatabase";

const router = Router();

const COOKIE_NAME = "auth_token";
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env["NODE_ENV"] === "production",
  sameSite: "lax" as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: "/",
};

// POST /api/auth/signup
router.post("/auth/signup", async (req, res) => {
  try {
    const { businessName, email, password, phone } = req.body as {
      businessName?: string;
      email?: string;
      password?: string;
      phone?: string;
    };

    if (!businessName?.trim() || !email?.trim() || !password || !phone?.trim()) {
      res
        .status(400)
        .json({ error: "businessName, email, phone, and password are required" });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters" });
      return;
    }

    const existing = await UserModel.findOne({
      email: email.toLowerCase().trim(),
    });
    if (existing) {
      res
        .status(409)
        .json({ error: "An account with this email already exists" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await UserModel.create({
      businessName: businessName.trim(),
      email: email.toLowerCase().trim(),
      passwordHash,
      phone: phone?.trim(),
    });
    try {
      await ensureTenantDatabase(String(user._id));
    } catch (tenantError) {
      await UserModel.deleteOne({ _id: user._id });
      logger.error({ err: tenantError, userId: String(user._id) }, "Tenant database initialization failed");
      res.status(503).json({ error: "Unable to initialize the account workspace" });
      return;
    }

    const token = signToken({ userId: user._id.toString(), email: user.email, kind: "user" });
    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);

    res.status(201).json({
      token,
      user: {
        id: user._id,
        businessName: user.businessName,
        email: user.email,
        phone: user.phone,
        timezone: user.timezone,
        role: user.role,
        creditBalance: user.creditBalance,
        metaWabaConnected: user.metaWabaConnected,
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/login
router.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body as {
      email?: string;
      password?: string;
    };

    if (!email?.trim() || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();
    let user = await UserModel.findOne({ email: normalizedEmail });
    if (!user) {
      // Handle legacy records created before the schema normalized email values.
      user = await UserModel.findOne({
        $expr: {
          $eq: [
            { $toLower: { $trim: { input: "$email" } } },
            normalizedEmail,
          ],
        },
      });
    }
    logger.info(
      {
        emailPresent: true,
        emailLength: normalizedEmail.length,
        userFound: Boolean(user),
        passwordLength: password.length,
        passwordHashPresent: Boolean(user?.passwordHash),
        passwordHashAlgorithm: user?.passwordHash?.split("$")[1] ?? null,
      },
      "Password login lookup",
    );
    if (!user) {
      logger.warn({ emailLength: normalizedEmail.length }, "Password login rejected: user not found");
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    logger.info({ valid }, "Password login comparison completed");
    if (!valid) {
      logger.warn("Password login rejected: bcrypt comparison failed");
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    if (user.active === false) {
      res.status(403).json({ error: "This account is inactive" });
      return;
    }

    const token = signToken({ userId: user._id.toString(), email: user.email, kind: "user" });
    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);

    res.json({
      token,
      user: {
        id: user._id,
        businessName: user.businessName,
        email: user.email,
        phone: user.phone,
        timezone: user.timezone,
        role: user.role,
        creditBalance: user.creditBalance,
        metaWabaConnected: user.metaWabaConnected,
        active: user.active !== false,
        permissions: user.permissions ?? [],
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/logout
router.post("/auth/logout", (_req, res) => {
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.json({ ok: true });
});

// GET /api/auth/me
router.get("/auth/me", authenticate, async (req: AuthRequest, res) => {
  try {
    const user = await UserModel.findById(req.user!.userId).select(
      "-passwordHash",
    );
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json({
      user: {
        id: user._id,
        businessName: user.businessName,
        email: user.email,
        phone: user.phone,
        timezone: user.timezone,
        role: user.role,
        creditBalance: user.creditBalance,
        metaWabaConnected: user.metaWabaConnected,
        active: user.active !== false,
        permissions: user.permissions ?? [],
      },
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
