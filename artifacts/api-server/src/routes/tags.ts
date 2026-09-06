import { Router } from "express";
import mongoose from "mongoose";
import { TagModel } from "../models/Tag";
import { ContactModel } from "../models/Contact";
import { authenticate, type AuthRequest } from "../middlewares/authenticate";

const router = Router();
router.use(authenticate);

// GET /api/tags
router.get("/tags", async (req: AuthRequest, res) => {
  try {
    const tags = await TagModel.find({ userId: req.user!.userId }).sort({ name: 1 });
    const counts = await ContactModel.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(req.user!.userId),
          tags: { $exists: true, $ne: [] },
        },
      },
      { $unwind: "$tags" },
      { $group: { _id: "$tags", count: { $sum: 1 } } },
    ]);
    const countMap = Object.fromEntries(counts.map(item => [String(item._id), item.count]));
    res.json({
      tags: tags.map(t => ({
        id: t._id,
        name: t.name,
        color: t.color,
        description: t.description ?? null,
        contactCount: countMap[String(t._id)] ?? 0,
        createdAt: t.createdAt,
      })),
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/tags
router.post("/tags", async (req: AuthRequest, res) => {
  try {
    const { name, color, description } = req.body as { name?: string; color?: string; description?: string };
    if (!name?.trim()) { res.status(400).json({ error: "name is required" }); return; }

    const tag = await TagModel.create({
      userId: req.user!.userId,
      name: name.trim(),
      color: color ?? "#22c55e",
      description: description?.trim(),
    });

    res.status(201).json({
      tag: {
        id: tag._id,
        name: tag.name,
        color: tag.color,
        description: tag.description ?? null,
        contactCount: 0,
        createdAt: tag.createdAt,
      },
    });
  } catch (err: unknown) {
    if ((err as { code?: number }).code === 11000) {
      res.status(409).json({ error: "A tag with this name already exists" });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

// PUT /api/tags/:id
router.put("/tags/:id", async (req: AuthRequest, res) => {
  try {
    const { name, color, description } = req.body as {
      name?: string;
      color?: string;
      description?: string;
    };
    const tag = await TagModel.findOne({ _id: req.params["id"], userId: req.user!.userId });
    if (!tag) {
      res.status(404).json({ error: "Tag not found" });
      return;
    }
    if (name !== undefined) {
      if (!name.trim()) {
        res.status(400).json({ error: "name is required" });
        return;
      }
      tag.name = name.trim();
    }
    if (color !== undefined) tag.color = color;
    if (description !== undefined) tag.description = description.trim();
    await tag.save();
    res.json({
      tag: {
        id: tag._id,
        name: tag.name,
        color: tag.color,
        description: tag.description ?? null,
        createdAt: tag.createdAt,
      },
    });
  } catch (err: unknown) {
    if ((err as { code?: number }).code === 11000) {
      res.status(409).json({ error: "A tag with this name already exists" });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/tags/:id
router.delete("/tags/:id", async (req: AuthRequest, res) => {
  try {
    const tag = await TagModel.findOne({ _id: req.params["id"], userId: req.user!.userId });
    if (!tag) { res.status(404).json({ error: "Tag not found" }); return; }

    // Remove tag reference from all contacts
    await ContactModel.updateMany(
      { userId: req.user!.userId, tags: tag._id },
      { $pull: { tags: tag._id } },
    );
    await tag.deleteOne();

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
