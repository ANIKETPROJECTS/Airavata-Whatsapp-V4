import { Router } from "express";
import mongoose from "mongoose";
import { AgentModel } from "../models/Agent";
import { authenticate, type AuthRequest } from "../middlewares/authenticate";

const router = Router();

router.get("/agents", authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user!.userId);
    const agents = await AgentModel.find({ userId }).sort({ createdAt: -1 }).lean();
    res.json({ agents: agents.map(a => ({ ...a, id: String(a._id) })) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

router.post("/agents", authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user!.userId);
    const { name, email, role = "agent", permissions } = req.body as {
      name: string; email: string; role?: string; permissions?: Record<string, boolean>;
    };
    if (!name || !email) return res.status(400).json({ error: "name and email are required" });
    const agent = await AgentModel.create({ userId, name, email, role, permissions });
    res.status(201).json({ agent: { ...agent.toObject(), id: String(agent._id) } });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

router.put("/agents/:id", authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user!.userId);
    const agent = await AgentModel.findOneAndUpdate(
      { _id: req.params.id, userId },
      { $set: req.body },
      { new: true },
    ).lean();
    if (!agent) return res.status(404).json({ error: "Agent not found" });
    res.json({ agent: { ...agent, id: String(agent._id) } });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

router.delete("/agents/:id", authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user!.userId);
    await AgentModel.findOneAndDelete({ _id: req.params.id, userId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

export default router;
