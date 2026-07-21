import { Router } from "express";
import mongoose from "mongoose";
import { CannedMessageModel } from "../models/CannedMessage";
import { authenticate, type AuthRequest } from "../middlewares/authenticate";

const router = Router();

router.get("/canned-messages", authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user!.userId);
    const { q } = req.query as { q?: string };
    const filter: Record<string, unknown> = { userId };
    if (q) filter.name = { $regex: q, $options: "i" };
    const messages = await CannedMessageModel.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ messages: messages.map(m => ({ ...m, id: String(m._id) })) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

router.post("/canned-messages", authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user!.userId);
    const { name, message, type = "text" } = req.body as { name: string; message: string; type?: string };
    if (!name || !message) return res.status(400).json({ error: "name and message are required" });
    const doc = await CannedMessageModel.create({ userId, name, message, type });
    res.status(201).json({ message: { ...doc.toObject(), id: String(doc._id) } });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

router.put("/canned-messages/:id", authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user!.userId);
    const doc = await CannedMessageModel.findOneAndUpdate(
      { _id: req.params.id, userId },
      { $set: req.body },
      { new: true },
    ).lean();
    if (!doc) return res.status(404).json({ error: "Canned message not found" });
    res.json({ message: { ...doc, id: String(doc._id) } });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

router.delete("/canned-messages/:id", authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user!.userId);
    await CannedMessageModel.findOneAndDelete({ _id: req.params.id, userId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

export default router;
