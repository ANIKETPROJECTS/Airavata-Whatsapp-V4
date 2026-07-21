import { Router } from "express";
import mongoose from "mongoose";
import { GroupModel } from "../models/Group";
import { ContactModel } from "../models/Contact";
import { authenticate, type AuthRequest } from "../middlewares/authenticate";

const router = Router();
router.use(authenticate);

// GET /api/groups  — list groups with member counts
router.get("/groups", async (req: AuthRequest, res) => {
  try {
    const groups = await GroupModel.find({ userId: req.user!.userId }).sort({ createdAt: -1 });

    // Get member counts in one aggregation (must cast userId string → ObjectId for pipelines)
    const counts = await ContactModel.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(req.user!.userId), groupId: { $exists: true, $ne: null } } },
      { $group: { _id: "$groupId", count: { $sum: 1 } } },
    ]);
    const countMap = Object.fromEntries(counts.map(c => [String(c._id), c.count]));

    res.json({
      groups: groups.map(g => ({
        id: g._id,
        name: g.name,
        description: g.description ?? null,
        memberCount: countMap[String(g._id)] ?? 0,
        createdAt: g.createdAt,
      })),
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/groups
router.post("/groups", async (req: AuthRequest, res) => {
  try {
    const { name, description, contactIds = [] } = req.body as {
      name?: string;
      description?: string;
      contactIds?: string[];
    };
    if (!name?.trim()) { res.status(400).json({ error: "name is required" }); return; }

    const group = await GroupModel.create({
      userId: req.user!.userId,
      name: name.trim(),
      description: description?.trim(),
    });

    // Assign selected contacts to this group
    let memberCount = 0;
    if (contactIds.length > 0) {
      const result = await ContactModel.updateMany(
        {
          _id: { $in: contactIds.map(id => new mongoose.Types.ObjectId(id)) },
          userId: req.user!.userId,
        },
        { groupId: group._id },
      );
      memberCount = result.modifiedCount;
    }

    res.status(201).json({
      group: { id: group._id, name: group.name, description: group.description ?? null, memberCount, createdAt: group.createdAt },
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/groups/:id
router.put("/groups/:id", async (req: AuthRequest, res) => {
  try {
    const { name, description } = req.body as { name?: string; description?: string };
    const group = await GroupModel.findOne({ _id: req.params["id"], userId: req.user!.userId });
    if (!group) { res.status(404).json({ error: "Group not found" }); return; }

    if (name?.trim()) group.name = name.trim();
    if (description !== undefined) group.description = description?.trim();
    await group.save();

    res.json({ group: { id: group._id, name: group.name, description: group.description ?? null } });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/groups/:id
router.delete("/groups/:id", async (req: AuthRequest, res) => {
  try {
    const group = await GroupModel.findOne({ _id: req.params["id"], userId: req.user!.userId });
    if (!group) { res.status(404).json({ error: "Group not found" }); return; }

    // Unassign contacts from this group before deleting
    await ContactModel.updateMany(
      { userId: req.user!.userId, groupId: group._id },
      { $unset: { groupId: 1 } },
    );
    await group.deleteOne();

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
