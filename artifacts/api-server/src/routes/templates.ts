import { Router } from "express";
import { TemplateModel } from "../models/Template";
import { authenticate, type AuthRequest } from "../middlewares/authenticate";
import {
  createMetaTemplate,
  deleteMetaTemplate,
  getMetaTemplates,
  sendTemplateMessage,
  type TemplateCategory,
  type HeaderType,
} from "../lib/whatsapp";

const router = Router();

// ── Helpers ────────────────────────────────────────────────────────────────────

function toUpper<T extends string>(v: unknown, fallback: T): T {
  return (typeof v === "string" ? v.toUpperCase() : fallback) as T;
}

function shape(t: Record<string, unknown> & { _id: unknown; createdAt?: unknown; updatedAt?: unknown }) {
  return {
    id: String(t._id),
    name: t.name,
    category: t.category,
    language: t.language,
    headerType: t.headerType,
    headerContent: t.headerContent,
    body: t.body,
    footer: t.footer,
    status: t.status,
    rejectionReason: t.rejectionReason,
    metaTemplateId: t.metaTemplateId,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

// ── Routes ─────────────────────────────────────────────────────────────────────

/**
 * GET /api/templates
 * Returns all templates for the user, syncing statuses from Meta in the background.
 */
router.get("/templates", authenticate, async (req: AuthRequest, res) => {
  try {
    // Best-effort status sync from Meta
    try {
      const metaList = await getMetaTemplates();
      const statusMap = new Map(metaList.map((t) => [t.name, t.status]));
      const dbTemplates = await TemplateModel.find({ userId: req.user!.userId }).lean();

      const ops = dbTemplates
        .filter((t) => {
          const metaStatus = statusMap.get(t.name);
          return metaStatus && metaStatus !== String(t.status).toUpperCase();
        })
        .map((t) => ({
          updateOne: {
            filter: { _id: t._id },
            update: { $set: { status: statusMap.get(t.name) } },
          },
        }));

      if (ops.length) await TemplateModel.bulkWrite(ops);
    } catch {
      // Sync failure is non-fatal — serve stale status rather than error
    }

    const templates = await TemplateModel.find({ userId: req.user!.userId })
      .sort({ createdAt: -1 })
      .lean();

    res.json({ templates: templates.map(shape) });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

/**
 * POST /api/templates
 * Submits a new template to Meta, then saves it to MongoDB.
 */
router.post("/templates", authenticate, async (req: AuthRequest, res) => {
  try {
    const {
      name, category, language, headerType, headerContent,
      body, footer, bodySamples, headerSample,
      // Authentication-only
      addSecurityRecommendation, codeExpirationMinutes, otpType,
    } = req.body as Record<string, unknown>;

    const cat = toUpper(category, "MARKETING") as TemplateCategory;

    if (!name || !category) {
      return res.status(400).json({ error: "name and category are required" });
    }
    if (cat !== "AUTHENTICATION" && !body) {
      return res.status(400).json({ error: "body is required for MARKETING and UTILITY templates" });
    }

    const metaResult = await createMetaTemplate({
      name: String(name),
      category: cat,
      language: String(language ?? "en_US"),
      headerType: toUpper(headerType ?? "NONE", "NONE") as HeaderType,
      headerContent: headerContent ? String(headerContent) : undefined,
      body: body ? String(body) : undefined,
      footer: footer ? String(footer) : undefined,
      bodySamples: Array.isArray(bodySamples) ? bodySamples.map(String) : undefined,
      headerSample: headerSample ? String(headerSample) : undefined,
      addSecurityRecommendation: addSecurityRecommendation === true,
      codeExpirationMinutes: codeExpirationMinutes ? Number(codeExpirationMinutes) : undefined,
      otpType: otpType ? String(otpType) as import("../lib/whatsapp").OtpType : undefined,
    });

    const template = await TemplateModel.create({
      userId: req.user!.userId,
      name,
      category: cat,
      language: language ?? "en_US",
      headerType: toUpper(headerType ?? "NONE", "NONE"),
      headerContent,
      body: body ?? "(authentication template)",
      footer,
      status: metaResult.status ?? "PENDING",
      metaTemplateId: metaResult.id,
    });

    res.status(201).json({ template: shape(template.toObject()) });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

/**
 * DELETE /api/templates/:id
 * Deletes from Meta (by name) then removes from MongoDB.
 */
router.delete("/templates/:id", authenticate, async (req: AuthRequest, res) => {
  try {
    const template = await TemplateModel.findOne({
      _id: req.params.id,
      userId: req.user!.userId,
    });
    if (!template) return res.status(404).json({ error: "Template not found" });

    try {
      await deleteMetaTemplate(template.name);
    } catch {
      // Non-fatal — the template may already be gone from Meta
    }

    await template.deleteOne();
    res.json({ ok: true });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

/**
 * POST /api/templates/send-test
 * Sends an APPROVED template as a test message.
 * Body: { templateId, to }
 */
router.post("/templates/send-test", authenticate, async (req: AuthRequest, res) => {
  try {
    const { templateId, to, variables } = req.body as {
      templateId: string;
      to: string;
      variables?: string[];
    };

    if (!templateId || !to) {
      return res.status(400).json({ error: "templateId and to are required" });
    }

    const template = await TemplateModel.findOne({
      _id: templateId,
      userId: req.user!.userId,
    });
    if (!template) return res.status(404).json({ error: "Template not found" });

    if (String(template.status).toUpperCase() !== "APPROVED") {
      return res.status(400).json({ error: "Only APPROVED templates can be sent" });
    }

    // Build body component parameters if variables were supplied
    const components =
      variables && variables.length > 0
        ? [
            {
              type: "body",
              parameters: variables.map((v) => ({ type: "text", text: v })),
            },
          ]
        : undefined;

    const result = await sendTemplateMessage(
      to,
      template.name,
      template.language ?? "en_US",
      components,
    );
    res.json({ ok: true, messageId: result.messages?.[0]?.id ?? null });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

export default router;
