import { Router } from "express";
import bcrypt from "bcryptjs";
import { UserModel } from "../models/User";
import { signToken } from "../lib/jwt";
import { authenticate, type AuthRequest } from "../middlewares/authenticate";

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

    if (!businessName?.trim() || !email?.trim() || !password) {
      res.status(400).json({ error: "businessName, email, and password are required" });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters" });
      return;
    }

    const existing = await UserModel.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      res.status(409).json({ error: "An account with this email already exists" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await UserModel.create({
      businessName: businessName.trim(),
      email: email.toLowerCase().trim(),
      passwordHash,
      phone: phone?.trim(),
    });

    const token = signToken({ userId: user._id.toString(), email: user.email });
    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);

    res.status(201).json({
      user: {
        id: user._id,
        businessName: user.businessName,
        email: user.email,
        phone: user.phone,
        timezone: user.timezone,
        creditBalance: user.creditBalance,
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/login
router.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email?.trim() || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    const user = await UserModel.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    // Always sync META_PHONE_NUMBER_ID onto the user so stale DB values don't break routing
    const configuredPhoneNumberId = process.env.META_PHONE_NUMBER_ID;
    if (configuredPhoneNumberId && user.metaPhoneNumberId !== configuredPhoneNumberId) {
      await UserModel.findByIdAndUpdate(user._id, { metaPhoneNumberId: configuredPhoneNumberId });
    }

    const token = signToken({ userId: user._id.toString(), email: user.email });
    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);

    res.json({
      user: {
        id: user._id,
        businessName: user.businessName,
        email: user.email,
        phone: user.phone,
        timezone: user.timezone,
        creditBalance: user.creditBalance,
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
    const user = await UserModel.findById(req.user!.userId).select("-passwordHash");
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
        creditBalance: user.creditBalance,
      },
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
