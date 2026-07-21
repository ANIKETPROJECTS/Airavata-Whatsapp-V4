import { Router } from "express";
import mongoose from "mongoose";
import { AttributeModel } from "../models/Attribute";
import { authenticate, type AuthRequest } from "../middlewares/authenticate";

const router = Router();

router.get("/attributes", authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user!.userId);
    const doc = await AttributeModel.findOneAndUpdate(
      { userId },
      { $setOnInsert: { userId } },
      { upsert: true, new: true },
    ).lean();
    res.json({ attributes: (doc?.attributes ?? []).map(a => ({ ...a, id: String(a._id) })) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

router.put("/attributes", authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user!.userId);
    const { attributes } = req.body as { attributes: Array<{ name: string }> };
    if (!Array.isArray(attributes)) return res.status(400).json({ error: "attributes must be an array" });
    const doc = await AttributeModel.findOneAndUpdate(
      { userId },
      { $set: { attributes } },
      { upsert: true, new: true },
    ).lean();
    res.json({ attributes: (doc?.attributes ?? []).map(a => ({ ...a, id: String(a._id) })) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

export default router;
