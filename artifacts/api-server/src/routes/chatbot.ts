import { Router } from "express";
import mongoose from "mongoose";
import { ChatbotFlowModel } from "../models/ChatbotFlow";
import { ChatbotExecutionModel } from "../models/ChatbotExecution";
import { ContactModel } from "../models/Contact";
import { authenticate, type AuthRequest } from "../middlewares/authenticate";
import { resolvePricingLookupForUser } from "../lib/pricing";
import { getChatbotExecutionStats, mergeChatbotExecutionStats } from "../lib/chatbotExecutionStats";

const router = Router();

// ── GET /api/chatbot/flows ───────────────────────────────────────────────────
router.get("/chatbot/flows", authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user!.userId);
    const flows = await ChatbotFlowModel.find({ userId: req.user!.userId })
      .select("-nodes -edges -history -logs")
      .sort({ updatedAt: -1 })
      .lean();
    const executionStats = await getChatbotExecutionStats(
      userId,
      flows.map((flow) => flow._id as mongoose.Types.ObjectId),
    );
    res.json({
      flows: flows.map((flow) => ({
        ...flow,
        analytics: mergeChatbotExecutionStats(
          flow.analytics as { triggered?: number; completed?: number } | undefined,
          executionStats.get(String(flow._id)),
        ),
        id: String(flow._id),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

// ── POST /api/chatbot/flows ──────────────────────────────────────────────────
router.post("/chatbot/flows", authenticate, async (req: AuthRequest, res) => {
  try {
    const { name, description } = req.body as { name?: unknown; description?: unknown };
    const cleanName = name === undefined ? "Untitled Flow" : typeof name === "string" ? name.trim() : "";
    const cleanDescription = description === undefined ? "" : typeof description === "string" ? description.trim() : "";
    if (!cleanName || cleanName.length > 100 || typeof name === "object") {
      return res.status(400).json({ error: "A chatbot name of 1 to 100 characters is required." });
    }
    if (typeof description !== "undefined" && typeof description !== "string") {
      return res.status(400).json({ error: "description must be a string." });
    }
    if (cleanDescription.length > 500) {
      return res.status(400).json({ error: "description must be 500 characters or fewer." });
    }
    const flow = await ChatbotFlowModel.create({
      userId: req.user!.userId,
      name: cleanName,
      description: cleanDescription,
      nodes: [{ id: "start-1", type: "start", position: { x: 300, y: 150 }, data: { label: "Start", description: "" } }],
      edges: [],
    });
    res.status(201).json({ flow: { ...flow.toObject(), id: String(flow._id) } });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

// ── POST /api/chatbot/flows/quick-faq ────────────────────────────────────────
// Create and publish a tenant-scoped location/contact auto-reply flow.
router.post("/chatbot/flows/quick-faq", authenticate, async (req: AuthRequest, res) => {
  try {
    const { businessName, location, contact } = req.body as {
      businessName?: unknown;
      location?: unknown;
      contact?: unknown;
    };

    const cleanBusinessName =
      typeof businessName === "string" ? businessName.trim() : "";
    const cleanLocation = typeof location === "string" ? location.trim() : "";
    const cleanContact = typeof contact === "string" ? contact.trim() : "";

    if (
      !cleanBusinessName ||
      cleanBusinessName.length > 100 ||
      !cleanLocation ||
      cleanLocation.length > 500 ||
      !cleanContact ||
      cleanContact.length > 200
    ) {
      return res.status(400).json({
        error: "Business name, location, and contact details are required and must fit the allowed lengths.",
      });
    }

    const userId = req.user!.userId;
    const name = `${cleanBusinessName} Location & Contact FAQ`;
    const existing = await ChatbotFlowModel.findOne({ userId, name }).select("_id").lean();
    if (existing) {
      return res.status(409).json({
        error: "A location and contact FAQ flow with this name already exists.",
        flowId: String(existing._id),
      });
    }

    const flow = await ChatbotFlowModel.create({
      userId,
      name,
      status: "PUBLISHED",
      nodes: [
        {
          id: "location-trigger",
          type: "keyword",
          position: { x: 120, y: 90 },
          data: {
            label: "Location question",
            keywords: ["location", "address", "where are you located", "where are you", "map", "directions"],
            matchType: "contains",
            caseSensitive: false,
          },
        },
        {
          id: "location-reply",
          type: "textReply",
          position: { x: 120, y: 250 },
          data: {
            label: "Send location",
            message: `Our location: ${cleanLocation}`,
            typingDelay: 0,
          },
        },
        {
          id: "contact-trigger",
          type: "keyword",
          position: { x: 480, y: 90 },
          data: {
            label: "Contact question",
            keywords: ["contact", "phone", "call", "reach you", "how can we contact", "how can i contact"],
            matchType: "contains",
            caseSensitive: false,
          },
        },
        {
          id: "contact-reply",
          type: "textReply",
          position: { x: 480, y: 250 },
          data: {
            label: "Send contact details",
            message: `You can contact ${cleanBusinessName} at ${cleanContact}.`,
            typingDelay: 0,
          },
        },
      ],
      edges: [
        { id: "location-to-reply", source: "location-trigger", target: "location-reply", animated: true },
        { id: "contact-to-reply", source: "contact-trigger", target: "contact-reply", animated: true },
      ],
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

async function clearChatbotFlowSessions(flowId: string, userId: string) {
  const now = new Date();
  await ChatbotExecutionModel.updateMany(
    {
      userId: new mongoose.Types.ObjectId(userId),
      flowId: new mongoose.Types.ObjectId(flowId),
      status: "ACTIVE",
    },
    { $set: { status: "STOPPED", endedAt: now, lastActivityAt: now } },
    { timestamps: false },
  );
  await ContactModel.updateMany(
    { userId, "chatbotSession.flowId": flowId },
    { $unset: { chatbotSession: 1 } },
    { timestamps: false },
  );
}

// ── PUT /api/chatbot/flows/:id ───────────────────────────────────────────────
router.put("/chatbot/flows/:id", authenticate, async (req: AuthRequest, res) => {
  try {
    const { name, description, nodes, edges, status, variables } = req.body as {
      name?: unknown; description?: unknown; nodes?: unknown[]; edges?: unknown[]; status?: unknown; variables?: unknown[];
    };

    if (name !== undefined && (typeof name !== "string" || !name.trim() || name.trim().length > 100)) {
      res.status(400).json({ error: "name must contain 1 to 100 characters" });
      return;
    }
    if (description !== undefined && (typeof description !== "string" || description.trim().length > 500)) {
      res.status(400).json({ error: "description must be a string of 500 characters or fewer" });
      return;
    }
    if (status !== undefined && status !== "DRAFT" && status !== "PUBLISHED") {
      res.status(400).json({ error: "status must be DRAFT or PUBLISHED" });
      return;
    }

    const flow = await ChatbotFlowModel.findOne({
      _id: new mongoose.Types.ObjectId(req.params["id"]),
      userId: req.user!.userId,
    });
    if (!flow) return res.status(404).json({ error: "Flow not found" });
    const previousStatus = flow.status;

    // Snapshot current state into history before overwriting (max 20 versions)
    if (nodes !== undefined) {
      const snapshot = { version: flow.version, nodes: flow.nodes, edges: flow.edges, savedAt: new Date() };
      const history = [...(flow.history ?? []), snapshot].slice(-20);
      flow.set("history", history);
      flow.set("version", flow.version + 1);
    }

    if (name !== undefined) flow.set("name", (name as string).trim());
    if (description !== undefined) flow.set("description", (description as string).trim());
    if (nodes !== undefined) flow.set("nodes", nodes);
    if (edges !== undefined) flow.set("edges", edges);
    if (status !== undefined) flow.set("status", status);
    if (variables !== undefined) flow.set("variables", variables);

    await flow.save();
    if (status === "DRAFT" || (status === "PUBLISHED" && previousStatus !== "PUBLISHED")) {
      await clearChatbotFlowSessions(String(flow._id), req.user!.userId);
    }
    res.json({ flow: { ...flow.toObject(), id: String(flow._id) } });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

// ── DELETE /api/chatbot/flows/:id ────────────────────────────────────────────
router.delete("/chatbot/flows/:id", authenticate, async (req: AuthRequest, res) => {
  try {
    const flowId = new mongoose.Types.ObjectId(req.params["id"]);
    const userId = new mongoose.Types.ObjectId(req.user!.userId);
    await clearChatbotFlowSessions(String(flowId), String(userId));
    await ChatbotExecutionModel.deleteMany({ flowId, userId });
    await ChatbotFlowModel.deleteOne({
      _id: flowId,
      userId,
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

// ── POST /api/chatbot/pricing/lookup ─────────────────────────────────────────
// Built-in resolver used by imported demo flows. It is also available as a
// normal endpoint for testing or for flows configured with this URL.
router.post("/chatbot/pricing/lookup", authenticate, async (req: AuthRequest, res) => {
  res.json(await resolvePricingLookupForUser(req.user!.userId, req.body as {
    car_category?: unknown;
    category?: unknown;
    service?: unknown;
    selected_service?: unknown;
  }));
});

// ── GET /api/chatbot/flows/:id/analytics ─────────────────────────────────────
router.get("/chatbot/flows/:id/analytics", authenticate, async (req: AuthRequest, res) => {
  try {
    const flowIdParam = req.params["id"];
    if (typeof flowIdParam !== "string" || !mongoose.isValidObjectId(flowIdParam)) {
      res.status(400).json({ error: "Invalid chatbot ID." });
      return;
    }
    const userId = new mongoose.Types.ObjectId(req.user!.userId);
    const flowId = new mongoose.Types.ObjectId(flowIdParam);
    const flow = await ChatbotFlowModel.findOne({
      _id: flowId,
      userId,
    }).select("analytics name status version createdAt updatedAt").lean();
    if (!flow) {
      res.status(404).json({ error: "Flow not found" });
      return;
    }

    const runStats = (await getChatbotExecutionStats(userId, [flowId])).get(String(flowId));
    const stats = mergeChatbotExecutionStats(
      flow.analytics as { triggered?: number; completed?: number } | undefined,
      runStats,
    );
    const triggered = stats.triggered;
    const completed = stats.completed;

    res.json({
      analytics: {
        triggered,
        completed,
        completionRate: triggered > 0 ? Math.round((completed / triggered) * 100) : 0,
        dropped: Math.max(0, triggered - completed),
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

// ── POST /api/chatbot/flows/:id/executions/query ─────────────────────────────
router.post("/chatbot/flows/:id/executions/query", authenticate, async (req: AuthRequest, res) => {
  try {
    const flowIdParam = req.params["id"];
    if (typeof flowIdParam !== "string" || !mongoose.isValidObjectId(flowIdParam)) {
      res.status(400).json({ error: "Invalid chatbot ID." });
      return;
    }

    const userId = new mongoose.Types.ObjectId(req.user!.userId);
    const flowId = new mongoose.Types.ObjectId(flowIdParam);
    const body = req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? req.body as { limit?: unknown; cursor?: unknown; status?: unknown }
      : {};
    const limit = body.limit === undefined ? 20 : Number(body.limit);
    const validStatuses = new Set(["ACTIVE", "COMPLETED", "INTERRUPTED", "STOPPED", "FAILED"]);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      res.status(400).json({ error: "limit must be an integer from 1 to 50." });
      return;
    }
    if (body.status !== undefined && (typeof body.status !== "string" || !validStatuses.has(body.status))) {
      res.status(400).json({ error: "Invalid execution status filter." });
      return;
    }

    const flow = await ChatbotFlowModel.findOne({ _id: flowId, userId })
      .select("analytics")
      .lean();
    if (!flow) {
      res.status(404).json({ error: "Flow not found" });
      return;
    }

    let cursor: { startedAt: Date; id: mongoose.Types.ObjectId } | undefined;
    if (body.cursor !== undefined) {
      if (typeof body.cursor !== "string" || body.cursor.length > 256) {
        res.status(400).json({ error: "Invalid activity cursor." });
        return;
      }
      try {
        const decoded = JSON.parse(Buffer.from(body.cursor, "base64url").toString("utf8")) as {
          startedAt?: unknown;
          id?: unknown;
        };
        const startedAt = new Date(String(decoded.startedAt ?? ""));
        if (
          Number.isNaN(startedAt.getTime()) ||
          typeof decoded.id !== "string" ||
          !mongoose.isValidObjectId(decoded.id)
        ) {
          res.status(400).json({ error: "Invalid activity cursor." });
          return;
        }
        cursor = { startedAt, id: new mongoose.Types.ObjectId(decoded.id) };
      } catch {
        res.status(400).json({ error: "Invalid activity cursor." });
        return;
      }
    }

    const filter: Record<string, unknown> = { userId, flowId };
    if (body.status) filter.status = body.status;
    if (cursor) {
      filter.$or = [
        { startedAt: { $lt: cursor.startedAt } },
        { startedAt: cursor.startedAt, _id: { $lt: cursor.id } },
      ];
    }

    const rows = await ChatbotExecutionModel.find(filter)
      .sort({ startedAt: -1, _id: -1 })
      .limit(limit + 1)
      .select("contactId triggerType status startedAt lastActivityAt endedAt")
      .populate({ path: "contactId", select: "name phone", match: { userId } })
      .lean() as unknown as Array<Record<string, unknown>>;

    const hasMore = rows.length > limit;
    const pageRows = rows.slice(0, limit);
    const executions = pageRows.map((row) => {
      const contact = row["contactId"] as Record<string, unknown> | null;
      return {
        id: String(row["_id"]),
        contactId: contact?._id ? String(contact._id) : null,
        contactName: typeof contact?.["name"] === "string" ? contact["name"] : null,
        contactPhone: typeof contact?.["phone"] === "string" ? contact["phone"] : null,
        triggerType: row["triggerType"],
        status: row["status"],
        startedAt: row["startedAt"],
        lastActivityAt: row["lastActivityAt"],
        endedAt: row["endedAt"] ?? null,
      };
    });

    const storedAnalytics = flow.analytics as { triggered?: number; completed?: number } | undefined;
    const runStats = (await getChatbotExecutionStats(userId, [flowId])).get(String(flowId));
    const stats = mergeChatbotExecutionStats(storedAnalytics, runStats);
    const lastRow = pageRows[pageRows.length - 1];
    const nextCursor = hasMore && lastRow
      ? Buffer.from(JSON.stringify({
          startedAt: new Date(String(lastRow["startedAt"])).toISOString(),
          id: String(lastRow["_id"]),
        })).toString("base64url")
      : null;

    res.json({ executions, stats, nextCursor });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Could not load chatbot activity" });
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

    const isBuiltInPricing =
      String(url).trim().toLowerCase() === "airavata://pricing/lookup" ||
      String(url).trim().toLowerCase() === "/api/chatbot/pricing/lookup" ||
      String(url).toLowerCase().includes("your-backend.example.com/api/pricing/lookup");
    if (isBuiltInPricing) {
      let parsedBody: Record<string, unknown> = {};
      if (typeof body === "string" && body.trim()) {
        try {
          parsedBody = JSON.parse(body) as Record<string, unknown>;
        } catch {
          return res.status(400).json({ error: "Built-in pricing request body must be valid JSON" });
        }
      }
      return res.json({
        status: 200,
        statusText: "OK",
        elapsed: 0,
        headers: { "content-type": "application/json" },
        body: await resolvePricingLookupForUser(req.user!.userId, parsedBody),
      });
    }

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
