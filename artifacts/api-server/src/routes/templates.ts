import { Router } from "express";
import mongoose from "mongoose";
import { TemplateModel } from "../models/Template";
import { ContactModel } from "../models/Contact";
import { MessageModel } from "../models/Message";
import { FlowModel } from "../models/Flow";
import { authenticate, type AuthRequest } from "../middlewares/authenticate";
import {
  createMetaTemplate,
  deleteMetaTemplate,
  getMetaTemplates,
  sendTemplateMessage,
  type TemplateCategory,
  type HeaderType,
  type CtaButtonParam,
} from "../lib/whatsapp";
import { withCreditCharge } from "../lib/creditDeduction";

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
    buttons: (t.buttons as unknown[] | undefined) ?? [],
    linkedChatbotFlowId: t.linkedChatbotFlowId ? String(t.linkedChatbotFlowId) : null,
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
      // Flow button
      flowButton,
      // Quick-reply / CTA buttons
      quickReplies,
      ctaButtons,
      // Linked chatbot
      linkedChatbotFlowId,
    } = req.body as Record<string, unknown>;

    type FlowButtonInput = { flowId: string; flowName?: string; text: string; navigateScreen: string };
    const fb = flowButton as FlowButtonInput | undefined;
    const qr = Array.isArray(quickReplies) ? (quickReplies as string[]).filter((s) => s.trim()) : undefined;
    const cta = Array.isArray(ctaButtons) ? (ctaButtons as CtaButtonParam[]) : undefined;

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
      flowButton: fb ? { flowId: fb.flowId, text: fb.text, navigateScreen: fb.navigateScreen } : undefined,
      quickReplies: qr,
      ctaButtons: cta,
    });

    // Build MongoDB buttons array from whichever mode is active
    let dbButtons: Array<{ type: string; text: string; value?: string; flowId?: string; flowName?: string; navigateScreen?: string }> = [];
    if (fb) {
      dbButtons = [{ type: "FLOW", text: fb.text, flowId: fb.flowId, flowName: fb.flowName, navigateScreen: fb.navigateScreen }];
    } else if (qr && qr.length > 0) {
      dbButtons = qr.slice(0, 3).map((text) => ({ type: "QUICK_REPLY", text }));
    } else if (cta && cta.length > 0) {
      dbButtons = cta.slice(0, 2).map((btn) => ({ type: btn.type, text: btn.text, value: btn.value }));
    }

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
      buttons: dbButtons,
      ...(linkedChatbotFlowId ? { linkedChatbotFlowId } : {}),
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

    const userId = new mongoose.Types.ObjectId(req.user!.userId);

    const template = await TemplateModel.findOne({ _id: templateId, userId });
    if (!template) return res.status(404).json({ error: "Template not found" });

    if (String(template.status).toUpperCase() !== "APPROVED") {
      return res.status(400).json({ error: "Only APPROVED templates can be sent" });
    }

    // Authentication templates pass the OTP code as a button parameter, not a body parameter.
    // Meta error #132000 occurs when you send no components (or body components) for auth templates.
    const isAuth = String(template.category).toUpperCase() === "AUTHENTICATION";
    let components: Array<{ type: string; sub_type?: string; index?: string; parameters: Array<{ type: string; text?: string }> }> | undefined;

    if (isAuth) {
      // The OTP code is the first element of variables[] when sent from the frontend.
      const otpCode = variables?.[0]?.trim();
      if (!otpCode) {
        return res.status(400).json({ error: "otpCode is required for authentication templates" });
      }
      // Authentication templates require the OTP in BOTH the body component ({{1}})
      // AND the button component. Sending only the button causes Meta error #132000:
      // "body: number of localizable_params (0) does not match the expected number of params (1)"
      components = [
        {
          type: "body",
          parameters: [{ type: "text", text: otpCode }],
        },
        {
          type: "button",
          sub_type: "url",
          index: "0",
          parameters: [{ type: "text", text: otpCode }],
        },
      ];
    } else {
      // Build the body component (only when there are variables to fill)
      const bodyComponent = variables && variables.length > 0
        ? {
            type: "body",
            parameters: variables.map((v) => ({ type: "text", text: v })),
          }
        : null;

      // If the template has FLOW buttons, Meta requires a button component with
      // sub_type "flow" and a flow_token action parameter, even when there are no
      // body variables. Without it Meta returns: "Components sub_type invalid".
      // We encode our internal Flow._id in the token so the webhook can link
      // the submission back to the correct flow and surface it in Responses.
      const flowButtons = (template.buttons ?? []).filter(
        (b: { type: string }) => b.type === "FLOW",
      );

      const flowButtonComponents = await Promise.all(
        flowButtons.map(async (btn: { type: string; flowId?: string }, i: number) => {
          // Look up internal MongoDB _id by metaFlowId so the webhook regex resolves it
          let flowToken = "unused";
          if (btn.flowId) {
            const internalFlow = await FlowModel.findOne({
              metaFlowId: btn.flowId,
              userId: new mongoose.Types.ObjectId(req.user!.userId),
            }).lean();
            if (internalFlow) {
              flowToken = `flow_${String(internalFlow._id)}_${Date.now()}`;
            }
          }
          return {
            type: "button",
            sub_type: "flow",
            index: String(i),
            parameters: [{ type: "action", action: { flow_token: flowToken } }],
          };
        }),
      );

      if (bodyComponent || flowButtonComponents.length > 0) {
        components = [
          ...(bodyComponent ? [bodyComponent] : []),
          ...flowButtonComponents,
        ];
      }
    }

    // Normalise phone: strip leading zeros / spaces
    const phone = to.trim().replace(/\s+/g, "");

    const category = String(template.category).toUpperCase() as
      | "AUTHENTICATION"
      | "UTILITY"
      | "MARKETING";
    const result = await withCreditCharge({
      userId,
      category,
      description: `Template test send to ${phone}`,
      send: () =>
        sendTemplateMessage(
          phone,
          template.name,
          template.language ?? "en_US",
          components,
          req.user!.userId,
        ),
    });
    const whatsappMessageId = result.messages?.[0]?.id ?? null;

    // ── Persist to Live Chat ───────────────────────────────────────────────────
    // Find or create the contact for this phone number
    let contact = await ContactModel.findOne({ userId, phone });
    if (!contact) {
      contact = await ContactModel.create({
        userId,
        phone,
        name: phone, // placeholder name; user can rename in Contacts
      });
    }

    // Build the rendered body text for live chat display — match what WhatsApp shows.
    // Auth templates store a placeholder body; reconstruct the actual Meta-rendered text.
    let bodyText: string;
    if (isAuth) {
      const otpCode = variables![0]!;
      bodyText = `${otpCode} is your verification code. For your security, do not share this code.`;
    } else {
      bodyText = template.body ?? "";
      if (variables && variables.length > 0) {
        bodyText = bodyText.replace(/\{\{(\d+)\}\}/g, (_, idx: string) => {
          const val = variables[parseInt(idx, 10) - 1];
          return val ?? `{{${idx}}}`;
        });
      }
    }

    await MessageModel.create({
      userId,
      contactId: contact._id,
      templateId: template._id,
      direction: "OUTBOUND",
      body: bodyText,
      whatsappMessageId,
      status: "SENT",
      sentAt: new Date(),
    });

    // Keep lastContactedAt fresh
    await ContactModel.updateOne({ _id: contact._id }, { lastContactedAt: new Date() });

    res.json({ ok: true, messageId: whatsappMessageId });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

export default router;
