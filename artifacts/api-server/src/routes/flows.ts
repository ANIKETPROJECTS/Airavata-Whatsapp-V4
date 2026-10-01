/**
 * WhatsApp Flows — create, edit, publish, and send Meta WhatsApp Flows.
 */

import { Router } from "express";
import mongoose from "mongoose";
import { FlowModel } from "../models/Flow";
import { CampaignModel } from "../models/Campaign";
import { CampaignRecipientModel } from "../models/CampaignRecipient";
import { ContactModel } from "../models/Contact";
import { MessageModel } from "../models/Message";
import { authenticate, type AuthRequest } from "../middlewares/authenticate";
import { logger } from "../lib/logger";
import { getCredentials, normalizeWhatsAppPhone } from "../lib/whatsapp";
import { enrollNewContactsInTriggerCampaigns } from "../lib/triggerEnrollment";
import { emitContactCreatedEvent } from "../lib/clientWebhooks";
import { normalizeContactPhone } from "../lib/contactPhone";

const router = Router();

const META_BASE = "https://graph.facebook.com/v21.0";
const FLOW_FIELD_TYPES = new Set([
  "TextInput", "TextArea", "Dropdown", "RadioButtonsGroup", "CheckboxGroup",
  "DatePicker", "OptIn", "PhotoPicker", "DocumentPicker",
]);
const IMAGE_DATA_URL = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/;
const ALLOWED_DOCUMENT_MIME_TYPES = new Set([
  "application/gzip",
  "application/msword",
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.oasis.opendocument.presentation",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/x-7z-compressed",
  "application/zip",
  "image/avif",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/png",
  "image/tiff",
  "image/webp",
  "text/plain",
  "video/mp4",
  "video/mpeg",
]);

interface FlowJsonComponent {
  type: string;
  text?: string | null;
  name?: string | null;
  label?: string | null;
  required?: boolean | null;
  options?: ReadonlyArray<{ id?: string | null; title?: string | null }>;
  inputType?: string | null;
  url?: string | null;
  description?: string | null;
  photoSource?: string | null;
  maxFileSizeKb?: number | null;
  maxUploadedFiles?: number | null;
  allowedMimeTypes?: ReadonlyArray<string> | null;
  src?: string | null;
  altText?: string | null;
  scaleType?: string | null;
}

interface FlowJsonScreen {
  id: string;
  title: string;
  isTerminal?: boolean | null;
  nextScreenId?: string | null;
  components: ReadonlyArray<FlowJsonComponent>;
}

interface FlowJsonDefinition {
  screens: ReadonlyArray<FlowJsonScreen>;
}

function flowFieldDataType(component: FlowJsonComponent): "string" | "number" | "boolean" | "array" {
  if (["CheckboxGroup", "PhotoPicker", "DocumentPicker"].includes(component.type)) return "array";
  if (component.type === "OptIn") return "boolean";
  if (component.type === "TextInput" && component.inputType === "number") return "number";
  return "string";
}

function dataFieldDefinition(type: "string" | "number" | "boolean" | "array") {
  if (type === "array") return { type: "array", __example__: [] };
  if (type === "boolean") return { type: "boolean", __example__: false };
  if (type === "number") return { type: "number", __example__: 0 };
  return { type: "string", __example__: "" };
}

function estimateInlineImageBytes(source: string) {
  const match = source.match(IMAGE_DATA_URL);
  if (!match) return 0;
  const base64 = match[2];
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor(base64.length * 3 / 4) - padding);
}

function validateInlineImageAssets(flow: FlowJsonDefinition): string[] {
  const errors: string[] = [];
  let totalBytes = 0;
  for (const screen of flow.screens) {
    for (const component of screen?.components ?? []) {
      if (!component) continue;
      if (component.type !== "Image" || !component.src) continue;
      if (!IMAGE_DATA_URL.test(component.src)) {
        errors.push("Images must be uploaded as PNG or JPG files.");
        continue;
      }
      const bytes = estimateInlineImageBytes(component.src);
      if (bytes > 1_000_000) errors.push("Each flow image must be 1 MB or smaller.");
      totalBytes += bytes;
    }
  }
  if (totalBytes > 3_000_000) errors.push("Images in this flow must total 3 MB or less. Remove or resize an image.");
  return errors;
}

function validateFlowForPublishing(flow: FlowJsonDefinition): string[] {
  const errors = validateInlineImageAssets(flow);
  const usedNames = new Set<string>();
  const totalScreens = flow.screens.length;
  const hasTerminal = flow.screens.some((screen) => screen.isTerminal);

  for (const [screenIndex, screen] of flow.screens.entries()) {
    const isEffectiveTerminal = Boolean(screen.isTerminal) || (!hasTerminal && screenIndex === totalScreens - 1);
    const mediaPickers = screen.components.filter((component) =>
      component.type === "PhotoPicker" || component.type === "DocumentPicker",
    );
    if (mediaPickers.length > 1) {
      errors.push(`“${screen.title}” has more than one photo or document upload. WhatsApp allows one upload picker per screen.`);
    }
    if (mediaPickers.length > 0 && !isEffectiveTerminal) {
      errors.push(`Move the photo or document upload on “${screen.title}” to a final screen. Uploaded files must be sent with the final answer.`);
    }
    if (screen.components.filter((component) => component.type === "OptIn").length > 5) {
      errors.push(`“${screen.title}” can have at most five consent checkboxes.`);
    }
    if (screen.components.filter((component) => component.type === "EmbeddedLink").length > 2) {
      errors.push(`“${screen.title}” can have at most two embedded links.`);
    }

    for (const component of screen.components) {
      if (FLOW_FIELD_TYPES.has(component.type)) {
        const name = component.name?.trim() ?? "";
        if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) {
          errors.push(`Add a valid answer name to “${component.label || component.type}”. Use a letter first, then letters, numbers, or underscores.`);
        } else if (usedNames.has(name)) {
          errors.push(`The answer name “${name}” is used more than once. Each answer name must be unique in the flow.`);
        } else {
          usedNames.add(name);
        }
        if (!component.label?.trim()) {
          errors.push(`Add a question or label to “${component.type}”.`);
        }
      }

      if (["Dropdown", "RadioButtonsGroup", "CheckboxGroup"].includes(component.type)) {
        const options = component.options ?? [];
        if (options.length === 0) errors.push(`Add at least one option to “${component.label || component.type}”.`);
        if (options.some((option) => !option.title?.trim())) {
          errors.push(`Fill in every option for “${component.label || component.type}”.`);
        }
        if (new Set(options.map((option) => option.id)).size !== options.length) {
          errors.push(`Options for “${component.label || component.type}” need unique IDs. Remove and re-add any duplicated options.`);
        }
      }

      if (component.type === "TextInput" && !["text", "number", "email", "phone", "password", "passcode"].includes(component.inputType ?? "text")) {
        errors.push(`Choose a supported input type for “${component.label || "Text Input"}”.`);
      }

      const textLimits: Record<string, number> = {
        TextHeading: 80,
        TextSubheading: 80,
        TextBody: 4096,
        TextCaption: 409,
      };
      if (textLimits[component.type] !== undefined) {
        const limit = textLimits[component.type];
        if (!component.text?.trim()) errors.push(`Add text to the ${component.type === "TextHeading" ? "heading" : component.type === "TextSubheading" ? "subheading" : component.type === "TextCaption" ? "caption" : "body text"}.`);
        else if (component.text.length > limit) errors.push(`${component.type} text must be ${limit} characters or fewer.`);
      }

      if (component.type === "OptIn" && (component.label?.length ?? 0) > 120) {
        errors.push("Consent statements must be 120 characters or fewer.");
      }

      if (component.type === "EmbeddedLink") {
        if (!component.text?.trim()) errors.push("Add text to the embedded link.");
        else if (component.text.length > 25) errors.push("Embedded link text must be 25 characters or fewer.");
      }

      if (component.type === "EmbeddedLink" || component.type === "OptIn" && component.url) {
        try {
          const url = new URL(component.url ?? "");
          if (!["http:", "https:"].includes(url.protocol)) throw new Error("unsupported protocol");
        } catch {
          errors.push(`Add a complete website address (https://...) to “${component.text || component.label || "link"}”.`);
        }
      }

      if (component.type === "PhotoPicker" || component.type === "DocumentPicker") {
        const count = component.maxUploadedFiles ?? 1;
        const sizeKb = component.maxFileSizeKb ?? 25600;
        if ((component.label?.length ?? 0) > 80) {
          errors.push(`The label for “${component.label || component.type}” must be 80 characters or fewer.`);
        }
        if (!Number.isInteger(count) || count < 1 || count > 10) {
          errors.push(`Set the maximum number of uploads for “${component.label || component.type}” between 1 and 10.`);
        }
        if (!Number.isInteger(sizeKb) || sizeKb < 1 || sizeKb > 25600) {
          errors.push(`Set the maximum file size for “${component.label || component.type}” between 1 KB and 25 MB.`);
        }
        if (component.description && component.description.length > 300) {
          errors.push(`The instructions for “${component.label || component.type}” must be 300 characters or fewer.`);
        }
        if (component.type === "PhotoPicker" && component.photoSource && !["camera_gallery", "camera", "gallery"].includes(component.photoSource)) {
          errors.push(`Choose a supported photo source for “${component.label || "Photo Upload"}”.`);
        }
        if (component.type === "DocumentPicker" && (component.allowedMimeTypes ?? []).some((mime) => !ALLOWED_DOCUMENT_MIME_TYPES.has(mime))) {
          errors.push(`Choose supported file types for “${component.label || "Document Upload"}”.`);
        }
      }

      if (component.type === "Image") {
        if (!component.src) {
          errors.push("Add a PNG or JPG image before publishing.");
        }
      }
    }
  }

  return errors.slice(0, 20);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function shapeFlow(f: Record<string, unknown> & { _id: unknown }) {
  return { ...f, id: String(f._id) };
}

const DIGIT_WORDS = ['ZERO','ONE','TWO','THREE','FOUR','FIVE','SIX','SEVEN','EIGHT','NINE'];

/** Replace digits in a screen ID so Meta accepts it (only letters + underscores allowed) */
function sanitizeScreenId(id: string): string {
  return id.replace(/\d/g, (d) => DIGIT_WORDS[parseInt(d)] ?? d);
}

/** Compile our internal screen format into Meta's Flow JSON */
function compileToMetaJson(flow: FlowJsonDefinition) {
  // Component types that collect user input and must be included in the payload
  // For each screen: the list of input fields it owns
  const screenFieldDefs = flow.screens.map((screen) =>
    screen.components
      .filter((c) => FLOW_FIELD_TYPES.has(c.type) && c.name)
      .map((c) => ({ name: c.name!, dataType: flowFieldDataType(c) })),
  );

  // Safety net: if no screen is explicitly marked terminal, treat the last one as terminal
  const hasTerminal = flow.screens.some((s) => s.isTerminal);
  const normalizedScreens = flow.screens.map((s, i) =>
    !hasTerminal && i === flow.screens.length - 1 ? { ...s, isTerminal: true } : s
  );

  const screens = normalizedScreens.map((screen, idx) => {
    // Fields from ALL previous screens, passed in via data.*
    const inheritedFields = screenFieldDefs.slice(0, idx).flat();
    // Fields on THIS screen, accessed via form.*
    const ownFields = screenFieldDefs[idx]!;

    const children: unknown[] = screen.components
      .map((comp) => {
        switch (comp.type) {
          case "TextHeading":
            return { type: "TextHeading", text: comp.text ?? "Heading" };
          case "TextSubheading":
            return { type: "TextSubheading", text: comp.text ?? "" };
          case "TextBody":
            return { type: "TextBody", text: comp.text ?? "" };
          case "TextCaption":
            return { type: "TextCaption", text: comp.text ?? "" };
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
              "data-source": (comp.options ?? []).map((o, i) => ({ id: o.id ?? `option_${i + 1}`, title: o.title ?? "" })),
            };
          case "RadioButtonsGroup":
            return {
              type: "RadioButtonsGroup",
              name: comp.name ?? "field",
              label: comp.label ?? "Select one",
              required: comp.required ?? false,
              "data-source": (comp.options ?? []).map((o, i) => ({ id: o.id ?? `option_${i + 1}`, title: o.title ?? "" })),
            };
          case "CheckboxGroup":
            return {
              type: "CheckboxGroup",
              name: comp.name ?? "field",
              label: comp.label ?? "Select all that apply",
              required: comp.required ?? false,
              "data-source": (comp.options ?? []).map((o, i) => ({ id: o.id ?? `option_${i + 1}`, title: o.title ?? "" })),
            };
          case "DatePicker":
            return {
              type: "DatePicker",
              name: comp.name ?? "field",
              label: comp.label ?? "Select date",
              required: comp.required ?? false,
            };
          case "OptIn":
            return {
              type: "OptIn",
              name: comp.name ?? "consent",
              label: comp.label ?? "I agree",
              required: comp.required ?? false,
              ...(comp.url ? { "on-click-action": { name: "open_url", url: comp.url } } : {}),
            };
          case "PhotoPicker":
            return {
              type: "PhotoPicker",
              name: comp.name ?? "photo_upload",
              label: comp.label ?? "Upload a photo",
              ...(comp.description ? { description: comp.description } : {}),
              "photo-source": comp.photoSource ?? "camera_gallery",
              "max-file-size-kb": comp.maxFileSizeKb ?? 25600,
              "min-uploaded-photos": comp.required ? 1 : 0,
              "max-uploaded-photos": comp.maxUploadedFiles ?? 1,
            };
          case "DocumentPicker":
            return {
              type: "DocumentPicker",
              name: comp.name ?? "document_upload",
              label: comp.label ?? "Upload a document",
              ...(comp.description ? { description: comp.description } : {}),
              "max-file-size-kb": comp.maxFileSizeKb ?? 25600,
              "min-uploaded-documents": comp.required ? 1 : 0,
              "max-uploaded-documents": comp.maxUploadedFiles ?? 1,
              ...(comp.allowedMimeTypes?.length ? { "allowed-mime-types": comp.allowedMimeTypes } : {}),
            };
          case "Image": {
            const match = comp.src?.match(IMAGE_DATA_URL);
            if (!match) throw new Error("Add a PNG or JPG image before publishing.");
            return {
              type: "Image",
              src: match[2],
              ...(comp.altText ? { "alt-text": comp.altText } : {}),
              "scale-type": comp.scaleType ?? "contain",
            };
          }
          case "EmbeddedLink":
            return {
              type: "EmbeddedLink",
              text: comp.text ?? "Read more",
              "on-click-action": { name: "open_url", url: comp.url ?? "" },
            };
          default:
            return null;
        }
      })
      .filter(Boolean);

    // Build the accumulated payload:
    //   - own fields  → "${form.<name>}"  (current screen)
    //   - inherited   → "${data.<name>}"  (passed from previous screens)
    const payload: Record<string, string> = {};
    for (const { name } of ownFields)       payload[name] = `\${form.${name}}`;
    for (const { name } of inheritedFields)  payload[name] = `\${data.${name}}`;

    // Add footer button with the accumulated payload
    children.push({
      type: "Footer",
      label: screen.isTerminal ? "Submit" : "Next",
      "on-click-action": screen.isTerminal
        ? { name: "complete", payload }
        : {
            name: "navigate",
            next: { type: "screen", name: sanitizeScreenId(screen.nextScreenId ?? "COMPLETE") },
            payload,
          },
    });

    // Non-first screens must declare a `data` block so Meta knows the shape
    // of values passed in from the previous navigate action.
    const dataBlock: Record<string, ReturnType<typeof dataFieldDefinition>> = {};
    for (const { name, dataType } of inheritedFields) dataBlock[name] = dataFieldDefinition(dataType);

    return {
      id: sanitizeScreenId(screen.id),
      title: screen.title,
      ...(screen.isTerminal ? { terminal: true } : {}),
      ...(Object.keys(dataBlock).length > 0 ? { data: dataBlock } : {}),
      layout: { type: "SingleColumnLayout", children },
    };
  });

  return { version: "7.0", screens };
}

/** Fetch flow metadata from Meta and persist it locally */
async function syncFlowFromMeta(flowId: unknown, metaFlowId: string, accessToken: string) {
  const meta = (await metaRequest(
    `/${metaFlowId}?fields=id,name,status,health_status,validation_errors,endpoint_uri`,
    "GET",
    accessToken,
  )) as {
    id?: string;
    name?: string;
    status?: string;
    health_status?: { can_send_message?: string; entities?: unknown[] };
    validation_errors?: unknown[];
    endpoint_uri?: string;
  };

  const patch: Record<string, unknown> = {
    healthStatus: meta.health_status?.can_send_message ?? null,
    validationErrors: meta.validation_errors ?? [],
  };
  if (meta.status) patch["status"] = meta.status;
  if (meta.endpoint_uri) patch["endpointUri"] = meta.endpoint_uri;

  return FlowModel.findByIdAndUpdate(flowId, { $set: patch }, { returnDocument: "after" }).lean();
}

/** Make an authenticated request to the Meta Graph API */
async function metaRequest(path: string, method: string, accessToken: string, body?: unknown) {
  const url = `${META_BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
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

async function uploadFlowJsonToMeta(flow: FlowJsonDefinition, metaFlowId: string, accessToken: string) {
  const formData = new FormData();
  formData.append("name", "flow.json");
  formData.append("asset_type", "FLOW_JSON");
  formData.append(
    "file",
    new Blob([JSON.stringify(compileToMetaJson(flow))], { type: "application/json" }),
    "flow.json",
  );

  const uploadRes = await fetch(`${META_BASE}/${metaFlowId}/assets`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: formData,
  });
  const uploadData = (await uploadRes.json()) as {
    error?: { message?: string };
    validation_errors?: Array<{ error: string; message: string }>;
  };
  if (!uploadRes.ok) {
    const detail = uploadData.validation_errors?.length
      ? ` Validation errors: ${JSON.stringify(uploadData.validation_errors)}`
      : "";
    throw new Error((uploadData.error?.message ?? "Failed to upload flow JSON") + detail);
  }
  if (uploadData.validation_errors?.length) {
    const summary = uploadData.validation_errors.map((e) => `${e.error}: ${e.message}`).join("; ");
    throw new Error(`Flow JSON validation failed: ${summary}`);
  }
}

function isWhatsAppDisconnectedError(err: unknown): boolean {
  return err instanceof Error && err.message === "WhatsApp is not connected for this account";
}

// ── GET /api/flows ────────────────────────────────────────────────────────────

router.get("/flows", authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user!.userId);
    const flows = await FlowModel.find({ userId }).sort({ createdAt: -1 }).lean();
    res.json({ flows: flows.map(shapeFlow) });
  } catch (err: unknown) {
    if (isWhatsAppDisconnectedError(err)) {
      return res.status(409).json({ error: err.message });
    }
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

    const imageErrors = validateInlineImageAssets({ screens: (screens ?? []) as FlowJsonScreen[] });
    if (imageErrors.length > 0) return res.status(400).json({ error: imageErrors.join(" ") });

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

    if (screens !== undefined) {
      const imageErrors = validateInlineImageAssets({ screens: screens as FlowJsonScreen[] });
      if (imageErrors.length > 0) return res.status(400).json({ error: imageErrors.join(" ") });
    }

    // Only include fields explicitly provided — omitting undefined prevents
    // $set from clearing fields like endpointUri that weren't part of this update.
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates["name"] = name;
    if (categories !== undefined) updates["categories"] = categories;
    if (screens !== undefined) updates["screens"] = screens;
    if (endpointUri !== undefined) updates["endpointUri"] = endpointUri;

    const flow = await FlowModel.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(req.params["id"]), userId },
      { $set: updates },
      { returnDocument: "after" },
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
        const { accessToken } = await getCredentials(req.user!.userId, {
          allowEnvFallback: false,
        });
        await metaRequest(`/${flow.metaFlowId}`, "DELETE", accessToken);
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
    const { wabaId, accessToken } = await getCredentials(req.user!.userId, {
      allowEnvFallback: false,
    });
    if (!wabaId) {
      return res.status(409).json({ error: "WhatsApp is not connected for this account" });
    }
    const userId = new mongoose.Types.ObjectId(req.user!.userId);
    const flow = await FlowModel.findOne({
      _id: new mongoose.Types.ObjectId(req.params["id"]),
      userId,
    }).lean();
    if (!flow) return res.status(404).json({ error: "Flow not found" });
    if (!flow.screens || flow.screens.length === 0) {
      return res.status(400).json({ error: "Flow must have at least one screen before publishing" });
    }
    const validationErrors = validateFlowForPublishing(flow);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: `Fix these items before publishing: ${validationErrors.join(" ")}`,
      });
    }

    let metaFlowId = flow.metaFlowId;

    // Step 1: Create on Meta if not yet created
    if (!metaFlowId) {
      const created = (await metaRequest(`/${wabaId}/flows`, "POST", accessToken, {
        name: flow.name,
        categories: flow.categories,
        ...(flow.endpointUri ? { endpoint_uri: flow.endpointUri } : {}),
      })) as { id: string };
      metaFlowId = created.id;
      await FlowModel.findByIdAndUpdate(flow._id, { metaFlowId });
    }

    // Step 2: Upload flow JSON asset
    await uploadFlowJsonToMeta(flow, metaFlowId, accessToken);

    // Step 3: Publish
    await metaRequest(`/${metaFlowId}/publish`, "POST", accessToken);

    // Step 4: Save metaFlowId + PUBLISHED status, then sync full metadata from Meta
    await FlowModel.findByIdAndUpdate(flow._id, { $set: { status: "PUBLISHED", metaFlowId } });
    const updated = await syncFlowFromMeta(flow._id, metaFlowId, accessToken);

    logger.info({ flowId: String(flow._id), metaFlowId }, "Flow published to Meta");
    res.json({ flow: shapeFlow(updated as Record<string, unknown> & { _id: unknown }) });
  } catch (err: unknown) {
    logger.error({ err }, "Failed to publish flow to Meta");
    if (isWhatsAppDisconnectedError(err)) {
      return res.status(409).json({ error: err.message });
    }
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

// ── POST /api/flows/:id/unpublish ──────────────────────────────────────────────

router.post("/flows/:id/unpublish", authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user!.userId);
    const flow = await FlowModel.findOne({
      _id: new mongoose.Types.ObjectId(String(req.params["id"])),
      userId,
    }).lean();
    if (!flow) {
      res.status(404).json({ error: "Flow not found" });
      return;
    }
    if (flow.status === "DRAFT") {
      res.json({ flow: shapeFlow(flow as Record<string, unknown> & { _id: unknown }) });
      return;
    }
    if (flow.status === "DEPRECATED") {
      res.status(409).json({ error: "Deprecated flows cannot be unpublished or published again" });
      return;
    }
    if (!flow.metaFlowId) {
      res.status(409).json({ error: "Published flow is missing its Meta Flow ID" });
      return;
    }

    const { accessToken } = await getCredentials(req.user!.userId, {
      allowEnvFallback: false,
    });
    // Meta transitions a published Flow back to Draft when its Flow JSON asset
    // is updated. Uploading the current JSON keeps content unchanged while
    // disabling production sends; the existing Flow ID can then be republished.
    await uploadFlowJsonToMeta(flow, flow.metaFlowId, accessToken);

    const updated = await FlowModel.findOneAndUpdate(
      { _id: flow._id, userId },
      { $set: { status: "DRAFT" } },
      { returnDocument: "after" },
    ).lean();
    if (!updated) {
      res.status(404).json({ error: "Flow not found" });
      return;
    }
    res.json({ flow: shapeFlow(updated as Record<string, unknown> & { _id: unknown }) });
  } catch (err: unknown) {
    if (isWhatsAppDisconnectedError(err)) {
      res.status(409).json({ error: err instanceof Error ? err.message : "WhatsApp is not connected for this account" });
      return;
    }
    logger.error({ err }, "Failed to unpublish flow from Meta");
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

// ── POST /api/flows/:id/sync ──────────────────────────────────────────────────

router.post("/flows/:id/sync", authenticate, async (req: AuthRequest, res) => {
  try {
    const { accessToken } = await getCredentials(req.user!.userId, {
      allowEnvFallback: false,
    });
    const userId = new mongoose.Types.ObjectId(req.user!.userId);
    const flow = await FlowModel.findOne({
      _id: new mongoose.Types.ObjectId(req.params["id"]),
      userId,
    }).lean();
    if (!flow) return res.status(404).json({ error: "Flow not found" });
    if (!flow.metaFlowId) {
      return res.status(400).json({ error: "Flow has not been published to Meta yet" });
    }

    const updated = await syncFlowFromMeta(flow._id, flow.metaFlowId, accessToken);
    res.json({ flow: shapeFlow(updated as Record<string, unknown> & { _id: unknown }) });
  } catch (err: unknown) {
    if (isWhatsAppDisconnectedError(err)) {
      return res.status(409).json({ error: err.message });
    }
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

    const { phone } = req.body as {
      phone: string;
    };

    if (!phone) return res.status(400).json({ error: "phone is required" });

    const normalizedPhone = normalizeContactPhone(phone);
    let contact = (await ContactModel.find({ userId }).lean()).find((candidate) => {
      try {
        return normalizeContactPhone(candidate.phone) === normalizedPhone;
      } catch {
        return false;
      }
    });
    if (contact && contact.status !== "active") {
      return res.status(400).json({ error: "Contact is not eligible for Flow sends" });
    }
    if (!contact) {
      const created = await ContactModel.create({
        userId,
        name: normalizedPhone,
        phone: normalizedPhone,
      });
      await enrollNewContactsInTriggerCampaigns(userId, [created._id]);
      void emitContactCreatedEvent(userId, created._id);
      contact = created.toObject();
    }

    const [campaign] = await CampaignModel.create([{
      userId,
      name: `Flow: ${flow.name}`,
      type: "FLOW",
      flowId: flow._id,
      audience: { contactIds: [contact._id] },
      status: "SCHEDULED",
      stats: { totalRecipients: 1, sent: 0, delivered: 0, read: 0, failed: 0 },
      creditCost: 1,
    }]);
    await CampaignRecipientModel.create({
      userId,
      campaignId: campaign!._id,
      contactId: contact._id,
      status: "QUEUED",
      currentStepId: "initial",
      nextActionAt: new Date(),
    });

    res.status(202).json({ success: true, campaignId: String(campaign!._id) });
  } catch (err: unknown) {
    logger.error({ err }, "Unable to queue Flow campaign send");
    if (isWhatsAppDisconnectedError(err)) {
      return res.status(409).json({ error: err.message });
    }
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

// ── GET /api/flows/:id/responses ─────────────────────────────────────────────

router.get("/flows/:id/responses", authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user!.userId);
    const flowId = new mongoose.Types.ObjectId(req.params["id"]);

    // Verify flow belongs to user
    const flow = await FlowModel.findOne({ _id: flowId, userId }).lean();
    if (!flow) return res.status(404).json({ error: "Flow not found" });

    const { MessageModel } = await import("../models/Message");
    const { ContactModel } = await import("../models/Contact");

    // Primary query: messages explicitly linked to this flow via flowId
    // Fallback: messages whose flowData.flow_token encodes this flow's internal ID
    //   (covers submissions where flowId resolution failed but token was stored)
    const messages = await MessageModel.find({
      userId,
      $or: [
        { flowId },
        { "flowData.flow_token": { $regex: `^flow_${String(flowId)}_` } },
      ],
    }).sort({ createdAt: -1 }).lean();

    const shaped = await Promise.all(
      messages.map(async (m) => {
        const contact = await ContactModel.findById(m.contactId).lean();
        return {
          id: String(m._id),
          contactName: contact?.name ?? "Unknown",
          contactPhone: contact?.phone ?? "",
          flowData: (m as Record<string, unknown>).flowData ?? {},
          submittedAt: m.createdAt,
        };
      })
    );

    res.json({ responses: shaped, total: shaped.length });
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
