import { Router } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { ApiKeyModel } from "../models/ApiKey";
import { UserModel } from "../models/User";
import { authenticate, type AuthRequest } from "../middlewares/authenticate";
import { getCredentials } from "../lib/whatsapp";

const router = Router();

// All routes require auth
router.use(authenticate);

/** Generate a secure random key: aira_<40 random hex chars> */
function generateRawKey(): string {
  return "aira_" + crypto.randomBytes(20).toString("hex");
}

/** First 12 chars of the full key (including prefix) used for display */
function makePrefix(rawKey: string): string {
  return rawKey.slice(0, 12);
}

// GET /api/apikeys — list active (non-revoked) keys for the logged-in user
router.get("/apikeys", async (req: AuthRequest, res) => {
  try {
    const keys = await ApiKeyModel.find({
      userId: req.user!.userId,
      revokedAt: { $exists: false },
    }).sort({ createdAt: -1 });

    let whatsapp: {
      connected: boolean;
      wabaId: string | null;
      phoneNumberId: string | null;
      accessTokenAvailable: boolean;
    } = {
      connected: false,
      wabaId: null,
      phoneNumberId: null,
      accessTokenAvailable: false,
    };

    try {
      const credentials = await getCredentials(req.user!.userId, {
        allowEnvFallback: false,
      });
      whatsapp = {
        connected: true,
        wabaId: credentials.wabaId ?? null,
        phoneNumberId: credentials.phoneNumberId,
        accessTokenAvailable: Boolean(credentials.accessToken),
      };
    } catch {
      // A tenant without a connected WhatsApp account still has usable API
      // key management; report the integration as disconnected without ever
      // falling back to another account's shared environment credentials.
    }

    res.json({
      keys: keys.map((k) => ({
        id: k._id,
        label: k.label,
        keyPrefix: k.keyPrefix,
        lastUsedAt: k.lastUsedAt ?? null,
        createdAt: k.createdAt,
      })),
      whatsapp,
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/apikeys — generate a new key
router.post("/apikeys", async (req: AuthRequest, res) => {
  try {
    const label: string = (req.body as { label?: string }).label?.trim() || "Default Key";

    const rawKey = generateRawKey();
    const keyHash = await bcrypt.hash(rawKey, 10);
    const keyPrefix = makePrefix(rawKey);

    const key = await ApiKeyModel.create({
      userId: req.user!.userId,
      label,
      keyHash,
      keyPrefix,
    });

    // Return the full raw key ONCE — it cannot be retrieved again
    res.status(201).json({
      key: {
        id: key._id,
        label: key.label,
        keyPrefix,
        rawKey, // shown to the user once only
        createdAt: key.createdAt,
      },
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/apikeys/whatsapp/reveal — re-authenticate before returning the
// decrypted tenant-scoped WhatsApp access token.
router.post("/apikeys/whatsapp/reveal", async (req: AuthRequest, res) => {
  try {
    const password = (req.body as { password?: string }).password;
    if (!password) {
      res.status(400).json({ error: "Password is required to reveal the WhatsApp access token" });
      return;
    }

    const user = await UserModel.findById(req.user!.userId)
      .select("passwordHash")
      .lean();
    if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      res.status(401).json({ error: "Incorrect password" });
      return;
    }

    const credentials = await getCredentials(req.user!.userId, {
      allowEnvFallback: false,
    });

    res.json({
      credentials: {
        wabaId: credentials.wabaId ?? null,
        phoneNumberId: credentials.phoneNumberId,
        accessToken: credentials.accessToken,
      },
    });
  } catch (error) {
    res.status(409).json({
      error: error instanceof Error ? error.message : "WhatsApp credentials are not connected for this account",
    });
  }
});

// DELETE /api/apikeys/:id — revoke a key
router.delete("/apikeys/:id", async (req: AuthRequest, res) => {
  try {
    const key = await ApiKeyModel.findOne({
      _id: req.params["id"],
      userId: req.user!.userId,
      revokedAt: { $exists: false },
    });

    if (!key) {
      res.status(404).json({ error: "API key not found" });
      return;
    }

    key.revokedAt = new Date();
    await key.save();

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
