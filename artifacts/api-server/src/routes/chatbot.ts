import { Router } from "express";
import mongoose from "mongoose";
import { ChatbotFlowModel } from "../models/ChatbotFlow";
import { authenticate, type AuthRequest } from "../middlewares/authenticate";

const router = Router();

// ── GET /api/chatbot/flows ───────────────────────────────────────────────────
router.get("/chatbot/flows", authenticate, async (req: AuthRequest, res) => {
  try {
    const flows = await ChatbotFlowModel.find({ userId: req.user!.userId })
      .select("-nodes -edges -history")
      .sort({ updatedAt: -1 })
      .lean();
    res.json({ flows: flows.map(f => ({ ...f, id: String(f._id) })) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

// ── POST /api/chatbot/flows ──────────────────────────────────────────────────
router.post("/chatbot/flows", authenticate, async (req: AuthRequest, res) => {
  try {
    const { name } = req.body as { name?: string };
    const flow = await ChatbotFlowModel.create({
      userId: req.user!.userId,
      name: name ?? "Untitled Flow",
      nodes: [{ id: "start-1", type: "start", position: { x: 300, y: 150 }, data: { label: "Start" } }],
      edges: [],
    });
    res.status(201).json({ flow: { ...flow.toObject(), id: String(flow._id) } });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

// ── GET /api/chatbot/flows/:id ───────────────────────────────────────────────
router.get("/chatbot/flows/:id", authenticate, async (req: AuthRequest, res) => {
  try {
    const flow = await ChatbotFlowModel.findOne({
      _id: new mongoose.Types.ObjectId(req.params["id"]),
      userId: req.user!.userId,
    }).lean();
    if (!flow) return res.status(404).json({ error: "Flow not found" });
    res.json({ flow: { ...flow, id: String(flow._id) } });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

// ── PUT /api/chatbot/flows/:id ───────────────────────────────────────────────
router.put("/chatbot/flows/:id", authenticate, async (req: AuthRequest, res) => {
  try {
    const { name, nodes, edges, status } = req.body as {
      name?: string; nodes?: unknown[]; edges?: unknown[]; status?: string;
    };

    const flow = await ChatbotFlowModel.findOne({
      _id: new mongoose.Types.ObjectId(req.params["id"]),
      userId: req.user!.userId,
    });
    if (!flow) return res.status(404).json({ error: "Flow not found" });

    // Snapshot current state into history before overwriting (max 20 versions)
    if (nodes !== undefined) {
      const snapshot = { version: flow.version, nodes: flow.nodes, edges: flow.edges, savedAt: new Date() };
      const history = [...(flow.history ?? []), snapshot].slice(-20);
      flow.set("history", history);
      flow.set("version", flow.version + 1);
    }

    if (name !== undefined) flow.set("name", name);
    if (nodes !== undefined) flow.set("nodes", nodes);
    if (edges !== undefined) flow.set("edges", edges);
    if (status !== undefined) flow.set("status", status);

    await flow.save();
    res.json({ flow: { ...flow.toObject(), id: String(flow._id) } });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

// ── DELETE /api/chatbot/flows/:id ────────────────────────────────────────────
router.delete("/chatbot/flows/:id", authenticate, async (req: AuthRequest, res) => {
  try {
    await ChatbotFlowModel.deleteOne({
      _id: new mongoose.Types.ObjectId(req.params["id"]),
      userId: req.user!.userId,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

// ── GET /api/chatbot/flows/:id/history ───────────────────────────────────────
router.get("/chatbot/flows/:id/history", authenticate, async (req: AuthRequest, res) => {
  try {
    const flow = await ChatbotFlowModel.findOne({
      _id: new mongoose.Types.ObjectId(req.params["id"]),
      userId: req.user!.userId,
    }).select("history version name").lean();
    if (!flow) return res.status(404).json({ error: "Flow not found" });
    res.json({ history: flow.history ?? [], currentVersion: flow.version });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

// ── POST /api/chatbot/flows/:id/restore ──────────────────────────────────────
router.post("/chatbot/flows/:id/restore", authenticate, async (req: AuthRequest, res) => {
  try {
    const { version } = req.body as { version: number };
    const flow = await ChatbotFlowModel.findOne({
      _id: new mongoose.Types.ObjectId(req.params["id"]),
      userId: req.user!.userId,
    });
    if (!flow) return res.status(404).json({ error: "Flow not found" });
    const snap = (flow.history ?? []).find((h: { version: number }) => h.version === version);
    if (!snap) return res.status(404).json({ error: "Version not found" });
    flow.set("nodes", snap.nodes);
    flow.set("edges", snap.edges);
    await flow.save();
    res.json({ flow: { ...flow.toObject(), id: String(flow._id) } });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

export default router;
