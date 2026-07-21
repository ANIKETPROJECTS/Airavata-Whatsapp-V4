import { Router } from "express";
import mongoose from "mongoose";
import { LiveChatSettingsModel } from "../models/LiveChatSettings";
import { authenticate, type AuthRequest } from "../middlewares/authenticate";

const router = Router();

router.get("/livechat-settings", authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user!.userId);
    const settings = await LiveChatSettingsModel.findOneAndUpdate(
      { userId },
      { $setOnInsert: { userId } },
      { upsert: true, new: true },
    ).lean();
    res.json({ settings: { ...settings, id: String(settings!._id) } });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

router.put("/livechat-settings", authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user!.userId);
    const settings = await LiveChatSettingsModel.findOneAndUpdate(
      { userId },
      { $set: req.body },
      { upsert: true, new: true },
    ).lean();
    res.json({ settings: { ...settings, id: String(settings!._id) } });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

export default router;
