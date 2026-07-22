/**
 * WhatsApp Flows — create, edit, publish, and send Meta WhatsApp Flows.
 */

import { Router } from "express";
import mongoose from "mongoose";
import { FlowModel } from "../models/Flow";
import { authenticate, type AuthRequest } from "../middlewares/authenticate";
import { logger } from "../lib/logger";

const router = Router();

const META_BASE = "https://graph.facebook.com/v21.0";
const WABA_ID = process.env["META_WABA_ID"];
const ACCESS_TOKEN = process.env["META_ACCESS_TOKEN"];
const PHONE_NUMBER_ID = process.env["META_PHONE_NUMBER_ID"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function shapeFlow(f: Record<string, unknown> & { _id: unknown }) {
  return { ...f, id: String(f._id) };
}

/** Compile our internal screen format into Meta's Flow JSON */
function compileToMetaJson(flow: {
  screens: Array<{
    id: string;
    title: string;
    isTerminal?: boolean;
    nextScreenId?: string;
    components: Array<{
      type: string;
      text?: string;
      name?: string;
      label?: string;
      required?: boolean;
      options?: Array<{ id: string; title: string }>;
      inputType?: string;
    }>;
  }>;
}) {
  const screens = flow.screens.map((screen) => {
    const children: unknown[] = screen.components
      .map((comp) => {
        switch (comp.type) {
          case "TextHeading":
            return { type: "TextHeading", text: comp.text ?? "Heading" };
          case "TextSubheading":
            return { type: "TextSubheading", text: comp.text ?? "" };
          case "TextBody":
            return { type: "TextBody", text: comp.text ?? "" };
          case "TextInput":
            return {
              type: "TextInput",
              name: comp.name ?? "field",
              label: comp.label ?? "Field",
              required: comp.required ?? false,
              "input-type": comp.inputType ?? "text",
            };
          case "TextArea":
            return {
              type: "TextArea",
              name: comp.name ?? "field",
              label: comp.label ?? "Field",
              required: comp.required ?? false,
            };
          case "Dropdown":
            return {
              type: "Dropdown",
              name: comp.name ?? "field",
              label: comp.label ?? "Select",
              required: comp.required ?? false,
              "data-source": (comp.options ?? []).map((o) => ({ id: o.id, title: o.title })),
            };
          case "RadioButtonsGroup":
            return {
              type: "RadioButtonsGroup",
              name: comp.name ?? "field",
              label: comp.label ?? "Select one",
              required: comp.required ?? false,
              "data-source": (comp.options ?? []).map((o) => ({ id: o.id, title: o.title })),
            };
          case "CheckboxGroup":
            return {
              type: "CheckboxGroup",
              name: comp.name ?? "field",
              label: comp.label ?? "Select all that apply",
              required: comp.required ?? false,
              "data-source": (comp.options ?? []).map((o) => ({ id: o.id, title: o.title })),
            };
          case "DatePicker":
            return {
              type: "DatePicker",
              name: comp.name ?? "field",
              label: comp.label ?? "Select date",
              required: comp.required ?? false,
            };
          default:
            return null;
        }
      })
      .filter(Boolean);

    // Add footer button
    children.push({
      type: "Footer",
      label: screen.isTerminal ? "Submit" : "Next",
      "on-click-action": screen.isTerminal
        ? { name: "complete", payload: {} }
        : {
            name: "navigate",
            next: { type: "screen", name: screen.nextScreenId ?? "COMPLETE" },
          },
    });

    return {
      id: screen.id,
      title: screen.title,
      layout: { type: "SingleColumnLayout", children },
    };
  });

  return { version: "7.0", screens };
}

/** Make an authenticated request to the Meta Graph API */
async function metaRequest(path: string, method: string, body?: unknown) {
  const url = `${META_BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json()) as { error?: { message?: string; error_user_msg?: string; error_user_title?: string; code?: number; error_subcode?: number } };
  if (!res.ok) {
    // Prefer the user-facing message from Meta when available
    const msg = data.error?.error_user_msg ?? data.error?.message ?? `Meta API error ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

// ── GET /api/flows ────────────────────────────────────────────────────────────

router.get("/flows", authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user!.userId);
    const flows = await FlowModel.find({ userId }).sort({ createdAt: -1 }).lean();
    res.json({ flows: flows.map(shapeFlow) });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

// ── GET /api/flows/:id ────────────────────────────────────────────────────────

router.get("/flows/:id", authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user!.userId);
    const flow = await FlowModel.findOne({
      _id: new mongoose.Types.ObjectId(req.params["id"]),
      userId,
    }).lean();
    if (!flow) return res.status(404).json({ error: "Flow not found" });
    res.json({ flow: shapeFlow(flow as Record<string, unknown> & { _id: unknown }) });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

// ── POST /api/flows ───────────────────────────────────────────────────────────

router.post("/flows", authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user!.userId);
    const { name, categories, screens, endpointUri } = req.body as {
      name: string;
      categories?: string[];
      screens?: unknown[];
      endpointUri?: string;
    };

    const flow = await FlowModel.create({
      userId,
      name,
      categories: categories ?? ["OTHER"],
      screens: screens ?? [],
      endpointUri,
      status: "DRAFT",
    });

    res.status(201).json({ flow: shapeFlow(flow.toObject() as Record<string, unknown> & { _id: unknown }) });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

// ── PUT /api/flows/:id ────────────────────────────────────────────────────────

router.put("/flows/:id", authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user!.userId);
    const { name, categories, screens, endpointUri } = req.body as {
      name?: string;
      categories?: string[];
      screens?: unknown[];
      endpointUri?: string;
    };

    const flow = await FlowModel.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(req.params["id"]), userId },
      { name, categories, screens, endpointUri },
      { new: true },
    ).lean();

    if (!flow) return res.status(404).json({ error: "Flow not found" });
    res.json({ flow: shapeFlow(flow as Record<string, unknown> & { _id: unknown }) });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

// ── DELETE /api/flows/:id ─────────────────────────────────────────────────────

router.delete("/flows/:id", authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user!.userId);
    const flow = await FlowModel.findOneAndDelete({
      _id: new mongoose.Types.ObjectId(req.params["id"]),
      userId,
    }).lean();

    if (!flow) return res.status(404).json({ error: "Flow not found" });

    if (flow.metaFlowId) {
      try {
        await metaRequest(`/${flow.metaFlowId}`, "DELETE");
      } catch (e) {
        logger.warn({ err: e }, "Failed to delete flow from Meta (may already be deleted)");
      }
    }

    res.json({ success: true });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

// ── POST /api/flows/:id/publish ───────────────────────────────────────────────

router.post("/flows/:id/publish", authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user!.userId);
    const flow = await FlowModel.findOne({
      _id: new mongoose.Types.ObjectId(req.params["id"]),
      userId,
    }).lean();
    if (!flow) return res.status(404).json({ error: "Flow not found" });
    if (!flow.screens || flow.screens.length === 0) {
      return res.status(400).json({ error: "Flow must have at least one screen before publishing" });
    }

    let metaFlowId = flow.metaFlowId;

    // Step 1: Create on Meta if not yet created
    if (!metaFlowId) {
      const created = (await metaRequest(`/${WABA_ID}/flows`, "POST", {
        name: flow.name,
        categories: flow.categories,
        ...(flow.endpointUri ? { endpoint_uri: flow.endpointUri } : {}),
      })) as { id: string };
      metaFlowId = created.id;
      await FlowModel.findByIdAndUpdate(flow._id, { metaFlowId });
    }

    // Step 2: Upload flow JSON asset
    const flowJson = compileToMetaJson(flow);
    const formData = new FormData();
    formData.append("name", "flow.json");
    formData.append("asset_type", "FLOW_JSON");
    formData.append(
      "file",
      new Blob([JSON.stringify(flowJson)], { type: "application/json" }),
      "flow.json",
    );

    const uploadRes = await fetch(`${META_BASE}/${metaFlowId}/assets`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
      body: formData,
    });
    const uploadData = (await uploadRes.json()) as { error?: { message?: string }; validation_errors?: unknown[] };
    if (!uploadRes.ok) {
      const detail = uploadData.validation_errors
        ? ` Validation errors: ${JSON.stringify(uploadData.validation_errors)}`
        : "";
      throw new Error((uploadData.error?.message ?? "Failed to upload flow JSON") + detail);
    }

    // Step 3: Publish
    await metaRequest(`/${metaFlowId}/publish`, "POST");

    // Step 4: Update local record
    const updated = await FlowModel.findByIdAndUpdate(
      flow._id,
      { status: "PUBLISHED", metaFlowId },
      { new: true },
    ).lean();

    logger.info({ flowId: String(flow._id), metaFlowId }, "Flow published to Meta");
    res.json({ flow: shapeFlow(updated as Record<string, unknown> & { _id: unknown }) });
  } catch (err: unknown) {
    logger.error({ err }, "Failed to publish flow to Meta");
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

// ── POST /api/flows/:id/send ──────────────────────────────────────────────────

router.post("/flows/:id/send", authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user!.userId);
    const flow = await FlowModel.findOne({
      _id: new mongoose.Types.ObjectId(req.params["id"]),
      userId,
    }).lean();
    if (!flow) return res.status(404).json({ error: "Flow not found" });
    if (flow.status !== "PUBLISHED" || !flow.metaFlowId) {
      return res.status(400).json({ error: "Flow must be published before sending" });
    }

    const { phone, headerText, bodyText, ctaLabel } = req.body as {
      phone: string;
      headerText?: string;
      bodyText?: string;
      ctaLabel?: string;
    };

    if (!phone) return res.status(400).json({ error: "phone is required" });

    const msgRes = await fetch(`${META_BASE}/${PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phone,
        type: "interactive",
        interactive: {
          type: "flow",
          header: { type: "text", text: headerText ?? flow.name },
          body: { text: bodyText ?? "Please complete the form below." },
          footer: { text: "Powered by Airavata" },
          action: {
            name: "flow",
            parameters: {
              flow_message_version: "3",
              flow_token: `flow_${String(flow._id)}_${Date.now()}`,
              flow_id: flow.metaFlowId,
              flow_cta: ctaLabel ?? "Open Form",
              flow_action: "navigate",
              flow_action_payload: {
                screen: flow.screens?.[0]?.id ?? "SCREEN_1",
              },
            },
          },
        },
      }),
    });

    const msgData = (await msgRes.json()) as {
      error?: { message?: string };
      messages?: Array<{ id: string }>;
    };
    if (!msgRes.ok) throw new Error(msgData.error?.message ?? "Failed to send message");

    res.json({ success: true, messageId: msgData.messages?.[0]?.id });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

// ── POST /api/flows/endpoint ──────────────────────────────────────────────────
// Meta calls this for dynamic flows. Must be unauthenticated.

router.post("/flows/endpoint", async (req, res) => {
  try {
    const { screen, data: _data, flow_token } = req.body as {
      screen?: string;
      data?: unknown;
      flow_token?: string;
    };
    logger.info({ screen, flow_token }, "Flow endpoint called by Meta");
    // Return empty completion — full dynamic handling requires key exchange (Phase 2)
    res.json({ screen: "SUCCESS", data: {} });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

export default router;
