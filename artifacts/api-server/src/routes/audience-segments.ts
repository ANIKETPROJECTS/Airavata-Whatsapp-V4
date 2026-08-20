import { Router } from "express";
import mongoose from "mongoose";
import { AudienceSegmentModel } from "../models/AudienceSegment";
import { authenticate, type AuthRequest } from "../middlewares/authenticate";
import { resolveAudience, type AudienceFilter } from "../lib/audienceResolver";

const router = Router();
router.use(authenticate);

function shape(segment: { _id: unknown; name: string; filter: unknown; estimatedCount?: number; createdAt?: Date; updatedAt?: Date }) {
  return {
    id: String(segment._id),
    name: segment.name,
    filter: segment.filter,
    estimatedCount: segment.estimatedCount ?? 0,
    createdAt: segment.createdAt,
    updatedAt: segment.updatedAt,
  };
}

router.get("/audience-segments", async (req: AuthRequest, res) => {
  try {
    const segments = await AudienceSegmentModel.find({ userId: req.user!.userId }).sort({ updatedAt: -1 }).lean();
    res.json({ segments: segments.map(shape) });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/audience-segments", async (req: AuthRequest, res) => {
  try {
    const { name, filter } = req.body as { name?: string; filter?: AudienceFilter };
    if (!name?.trim() || !filter) {
      res.status(400).json({ error: "name and filter are required" });
      return;
    }
    const userId = new mongoose.Types.ObjectId(req.user!.userId);
    const count = (await resolveAudience(userId, { filter })).length;
    const segment = await AudienceSegmentModel.create({
      userId,
      name: name.trim(),
      filter,
      estimatedCount: count,
    });
    res.status(201).json({ segment: shape(segment.toObject()) });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      res.status(409).json({ error: "A segment with this name already exists" });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/audience-segments/preview", async (req: AuthRequest, res) => {
  try {
    const { filter } = req.body as { filter?: AudienceFilter };
    if (!filter) {
      res.status(400).json({ error: "filter is required" });
      return;
    }
    const contacts = await resolveAudience(req.user!.userId, { filter });
    res.json({
      count: contacts.length,
      contacts: contacts.slice(0, 100).map((contact) => ({
        id: String(contact._id),
        name: contact.name,
        phone: contact.phone,
      })),
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/audience-segments/:id", async (req: AuthRequest, res) => {
  try {
    const { name, filter } = req.body as { name?: string; filter?: AudienceFilter };
    const segment = await AudienceSegmentModel.findOne({ _id: req.params.id, userId: req.user!.userId });
    if (!segment) {
      res.status(404).json({ error: "Audience segment not found" });
      return;
    }
    if (name?.trim()) segment.name = name.trim();
    if (filter) {
      segment.filter = filter;
      segment.estimatedCount = (await resolveAudience(req.user!.userId, { filter })).length;
    }
    await segment.save();
    res.json({ segment: shape(segment.toObject()) });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/audience-segments/:id", async (req: AuthRequest, res) => {
  try {
    const deleted = await AudienceSegmentModel.findOneAndDelete({ _id: req.params.id, userId: req.user!.userId });
    if (!deleted) {
      res.status(404).json({ error: "Audience segment not found" });
      return;
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;