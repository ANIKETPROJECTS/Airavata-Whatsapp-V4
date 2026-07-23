import { Router } from "express";
import mongoose from "mongoose";
import { ChatbotFlowModel } from "../models/ChatbotFlow";
import { authenticate, type AuthRequest } from "../middlewares/authenticate";

const router = Router();

// ── GET /api/chatbot/flows ───────────────────────────────────────────────────
router.get("/chatbot/flows", authenticate, async (req: AuthRequest, res) => {
  try {
    const flows = await ChatbotFlowModel.find({ userId: req.user!.userId })
      .select("-nodes -edges -history -logs")
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
      nodes: [{ id: "start-1", type: "start", position: { x: 300, y: 150 }, data: { label: "Start", description: "" } }],
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
    }).select("-logs").lean();
    if (!flow) return res.status(404).json({ error: "Flow not found" });
    res.json({ flow: { ...flow, id: String(flow._id) } });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

// ── PUT /api/chatbot/flows/:id ───────────────────────────────────────────────
router.put("/chatbot/flows/:id", authenticate, async (req: AuthRequest, res) => {
  try {
    const { name, nodes, edges, status, variables } = req.body as {
      name?: string; nodes?: unknown[]; edges?: unknown[]; status?: string; variables?: unknown[];
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
    if (variables !== undefined) flow.set("variables", variables);

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
    res.json({ history: (flow.history ?? []).slice().reverse(), currentVersion: flow.version });
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

// ── GET /api/chatbot/flows/:id/analytics ─────────────────────────────────────
router.get("/chatbot/flows/:id/analytics", authenticate, async (req: AuthRequest, res) => {
  try {
    const flow = await ChatbotFlowModel.findOne({
      _id: new mongoose.Types.ObjectId(req.params["id"]),
      userId: req.user!.userId,
    }).select("analytics name status version createdAt updatedAt").lean();
    if (!flow) return res.status(404).json({ error: "Flow not found" });

    const analytics = (flow as Record<string, unknown>).analytics as { triggered?: number; completed?: number } | undefined;
    const triggered = analytics?.triggered ?? 0;
    const completed = analytics?.completed ?? 0;

    res.json({
      analytics: {
        triggered,
        completed,
        completionRate: triggered > 0 ? Math.round((completed / triggered) * 100) : 0,
        dropped: triggered - completed,
        version: (flow as Record<string, unknown>).version,
        status: (flow as Record<string, unknown>).status,
        createdAt: (flow as Record<string, unknown>).createdAt,
        updatedAt: (flow as Record<string, unknown>).updatedAt,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

// ── GET /api/chatbot/flows/:id/logs ──────────────────────────────────────────
router.get("/chatbot/flows/:id/logs", authenticate, async (req: AuthRequest, res) => {
  try {
    const flow = await ChatbotFlowModel.findOne({
      _id: new mongoose.Types.ObjectId(req.params["id"]),
      userId: req.user!.userId,
    }).select("logs").lean();
    if (!flow) return res.status(404).json({ error: "Flow not found" });

    // Return last 100 logs descending
    const logs = ((flow as Record<string, unknown>).logs as unknown[] | undefined) ?? [];
    res.json({ logs: (logs as unknown[]).slice(-100).reverse() });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

// ── POST /api/chatbot/flows/test-api ─────────────────────────────────────────
// Proxy API test calls from within the CustomApi node config
router.post("/chatbot/test-api", authenticate, async (req: AuthRequest, res) => {
  try {
    const { method, url, headers: rawHeaders, body } = req.body as {
      method: string;
      url: string;
      headers: Array<{ key: string; value: string }>;
      body?: string;
    };

    if (!url) return res.status(400).json({ error: "URL is required" });

    const headersObj: Record<string, string> = {};
    (rawHeaders ?? []).forEach(({ key, value }) => {
      if (key.trim()) headersObj[key.trim()] = value;
    });

    const start = Date.now();
    const fetchRes = await fetch(url, {
      method: method || "GET",
      headers: headersObj,
      body: ["GET", "HEAD"].includes(method) ? undefined : body || undefined,
    });

    const elapsed = Date.now() - start;
    let responseBody: unknown;
    const ct = fetchRes.headers.get("content-type") ?? "";
    if (ct.includes("json")) {
      responseBody = await fetchRes.json();
    } else {
      responseBody = await fetchRes.text();
    }

    res.json({
      status: fetchRes.status,
      statusText: fetchRes.statusText,
      elapsed,
      headers: Object.fromEntries(fetchRes.headers.entries()),
      body: responseBody,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Request failed" });
  }
});

export default router;
