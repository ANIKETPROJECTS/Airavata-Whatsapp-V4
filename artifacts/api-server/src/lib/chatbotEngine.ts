/**
 * Chatbot Execution Engine
 *
 * Walks a published ChatbotFlow node graph when a WhatsApp message arrives,
 * sends replies via the Meta Cloud API, and tracks per-contact session state
 * so multi-step interactive flows (buttons, lists) work correctly across
 * multiple messages.
 *
 * Entry point: runChatbotEngine()
 */

import mongoose from "mongoose";
import { ChatbotFlowModel } from "../models/ChatbotFlow";
import { ContactModel } from "../models/Contact";
import { MessageModel } from "../models/Message";
import { FlowModel } from "../models/Flow";
import { logger } from "./logger";
import {
  sendTextMessage,
  sendMediaByUrl,
  sendInteractiveButtons,
  sendInteractiveList,
  sendLocationRequest,
  sendLocationMessage,
  sendTemplateMessage,
} from "./whatsapp";

// ── Internal Types ─────────────────────────────────────────────────────────────

interface ChatbotNode {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

interface ChatbotEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
}

interface ChatbotFlow {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  name: string;
  status: string;
  nodes: ChatbotNode[];
  edges: ChatbotEdge[];
}

interface Session {
  flowId: string;
  currentNodeId: string;
  variables: Record<string, unknown>;
  startedAt: Date;
}

export interface IncomingContext {
  /** Plain text body (for text messages) */
  text?: string;
  /** ID of the button/list row the user tapped — from button_reply / list_reply */
  interactiveReplyId?: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

/** Hard cap on sequential node executions per message to prevent infinite loops */
const MAX_STEPS = 25;

// ── Public Entry Point ─────────────────────────────────────────────────────────

/**
 * Called from the webhook after every inbound message that should be handled
 * by the chatbot (i.e. text messages and interactive button/list replies —
 * NOT WhatsApp Flow form submissions).
 */
export async function runChatbotEngine(
  contactId: mongoose.Types.ObjectId,
  userId: mongoose.Types.ObjectId,
  ctx: IncomingContext,
): Promise<void> {
  const contact = await ContactModel.findById(contactId).lean() as Record<string, unknown> | null;
  if (!contact) return;

  const phone = (contact["phone"] as string).replace(/\s+/g, "");
  const session = contact["chatbotSession"] as Session | undefined;

  // ── Resume existing session (contact mid-flow, waiting for button/list) ──
  if (session?.flowId && session?.currentNodeId) {
    const flow = await ChatbotFlowModel.findOne({
      _id: new mongoose.Types.ObjectId(session.flowId),
      userId,
      status: "PUBLISHED",
    }).lean() as ChatbotFlow | null;

    if (flow) {
      if (ctx.interactiveReplyId) {
        // Find the outgoing edge matching the button/row the user pressed
        const edge =
          flow.edges.find(
            (e) =>
              e.source === session.currentNodeId &&
              e.sourceHandle === ctx.interactiveReplyId,
          ) ??
          flow.edges.find((e) => e.source === session.currentNodeId); // fallback: first edge

        if (edge) {
          await executeFlow(
            flow, edge.target, phone, contact, userId, contactId, session.variables ?? {},
          );
          return;
        }
      }

      // User sent a plain text message while mid-flow.
      // Check if it matches a keyword trigger in any flow (allows flow switching).
      const published = await ChatbotFlowModel.find({ userId, status: "PUBLISHED" }).lean() as ChatbotFlow[];
      const kw = findKeywordTriggerInFlows(published, ctx.text);
      if (kw) {
        await clearSession(contactId);
        await executeFlow(kw.flow, kw.startNodeId, phone, contact, userId, contactId, {});
        return;
      }

      // Stay in session, no action — wait for valid button press
      return;
    }

    // Flow no longer published — clear stale session and fall through
    await clearSession(contactId);
  }

  // ── Find a matching trigger in all published flows ────────────────────────
  const publishedFlows = await ChatbotFlowModel.find({ userId, status: "PUBLISHED" }).lean() as ChatbotFlow[];
  if (!publishedFlows.length) return;

  // Priority 1 — keyword triggers (specific beats generic)
  const kwMatch = findKeywordTriggerInFlows(publishedFlows, ctx.text);
  if (kwMatch) {
    await executeFlow(kwMatch.flow, kwMatch.startNodeId, phone, contact, userId, contactId, {});
    return;
  }

  // Priority 2 — start triggers (fire on any message when no session is active)
  const startMatch = findStartTrigger(publishedFlows);
  if (startMatch) {
    await executeFlow(startMatch.flow, startMatch.startNodeId, phone, contact, userId, contactId, {});
    return;
  }
}

// ── Trigger Resolution ─────────────────────────────────────────────────────────

function findKeywordTriggerInFlows(
  flows: ChatbotFlow[],
  text: string | undefined,
): { flow: ChatbotFlow; startNodeId: string } | null {
  if (!text) return null;

  for (const flow of flows) {
    for (const node of flow.nodes) {
      if (node.type !== "keyword") continue;

      const keywords = (node.data["keywords"] as string[] | undefined) ?? [];
      const matchType = (node.data["matchType"] as string | undefined) ?? "contains";
      const caseSensitive = (node.data["caseSensitive"] as boolean | undefined) ?? false;

      const input = caseSensitive ? text.trim() : text.trim().toLowerCase();

      const matched = keywords.some((kw) => {
        const k = caseSensitive ? kw.trim() : kw.trim().toLowerCase();
        return matchType === "exact" ? input === k : input.includes(k);
      });

      if (matched) {
        // Jump directly to the first node after the keyword trigger
        const edge = flow.edges.find((e) => e.source === node.id);
        return { flow, startNodeId: edge?.target ?? node.id };
      }
    }
  }
  return null;
}

function findStartTrigger(
  flows: ChatbotFlow[],
): { flow: ChatbotFlow; startNodeId: string } | null {
  for (const flow of flows) {
    const startNode = flow.nodes.find((n) => n.type === "start");
    if (startNode) {
      const edge = flow.edges.find((e) => e.source === startNode.id);
      return { flow, startNodeId: edge?.target ?? startNode.id };
    }
  }
  return null;
}

// ── Flow Execution Loop ────────────────────────────────────────────────────────

async function executeFlow(
  flow: ChatbotFlow,
  startNodeId: string,
  phone: string,
  contact: Record<string, unknown>,
  userId: mongoose.Types.ObjectId,
  contactId: mongoose.Types.ObjectId,
  variables: Record<string, unknown>,
): Promise<void> {
  let currentNodeId: string | undefined = startNodeId;
  let steps = 0;

  while (currentNodeId && steps < MAX_STEPS) {
    steps++;

    const node = flow.nodes.find((n) => n.id === currentNodeId);
    if (!node) {
      logger.warn({ nodeId: currentNodeId, flowId: String(flow._id) }, "Chatbot node not found");
      break;
    }

    logger.info({ step: steps, nodeId: node.id, type: node.type }, "Chatbot executing node");

    // Re-fetch contact so attribute/tag changes made mid-flow are visible to conditions
    const freshContact =
      (await ContactModel.findById(contactId).lean()) as Record<string, unknown> | null;
    if (!freshContact) break;

    const result = await executeNode(
      node, flow, phone, freshContact, userId, contactId, variables,
    );

    if (result.error) {
      logger.error({ nodeId: node.id, error: result.error }, "Chatbot node error — stopping flow");
      break;
    }

    if (result.waitForInput) {
      // Save where we stopped so we can resume on the next message
      await saveSession(contactId, {
        flowId: String(flow._id),
        currentNodeId: node.id,
        variables,
        startedAt: new Date(),
      });
      return;
    }

    // Advance to the next node via the appropriate outgoing edge
    const handle = result.edgeHandle; // set by branching nodes (condition, errorHandler)
    const outEdge = flow.edges.find(
      (e) =>
        e.source === currentNodeId &&
        (handle !== undefined ? e.sourceHandle === handle : true),
    );

    currentNodeId = outEdge?.target;
  }

  // Flow finished — clear session
  await clearSession(contactId);

  if (steps >= MAX_STEPS) {
    logger.warn({ flowId: String(flow._id) }, "Chatbot max steps reached");
  }
}

// ── Node Executor ──────────────────────────────────────────────────────────────

async function executeNode(
  node: ChatbotNode,
  _flow: ChatbotFlow,
  phone: string,
  contact: Record<string, unknown>,
  userId: mongoose.Types.ObjectId,
  contactId: mongoose.Types.ObjectId,
  variables: Record<string, unknown>,
): Promise<{ waitForInput?: boolean; edgeHandle?: string; error?: string }> {
  const d = node.data;

  try {
    switch (node.type) {

      // ── Triggers — pass-through, no action ──────────────────────────────
      case "start":
      case "keyword":
        return {};

      // ── Text Reply ────────────────────────────────────────────────────────
      case "textReply": {
        const message = interpolate(String(d["message"] ?? ""), variables, contact);
        if (message) {
          const ms = Number(d["typingDelay"] ?? 0);
          if (ms > 0 && ms <= 5000) await sleep(ms);
          await sendTextMessage(phone, message);
          await storeOutbound(userId, contactId, message);
        }
        return {};
      }

      // ── Media Reply ───────────────────────────────────────────────────────
      case "mediaReply": {
        const mediaType = (d["mediaType"] as "image" | "video" | "audio" | "document") ?? "image";
        const mediaUrl = String(d["mediaUrl"] ?? "");
        const caption = d["caption"] ? String(d["caption"]) : undefined;
        if (mediaUrl) {
          await sendMediaByUrl(phone, mediaType, mediaUrl, caption);
          await storeOutbound(userId, contactId, `[${mediaType}]`, { mediaType, mediaUrl });
        }
        return {};
      }

      // ── CTA Buttons — waits for user to press a button ───────────────────
      case "ctaButton": {
        const body = interpolate(String(d["body"] ?? ""), variables, contact);
        const footer = d["footer"] ? String(d["footer"]) : undefined;
        const buttons = (d["buttons"] as Array<{ id: string; title: string }> | undefined) ?? [];
        if (body && buttons.length > 0) {
          await sendInteractiveButtons(phone, body, footer, buttons);
          await storeOutbound(userId, contactId, body);
        }
        return { waitForInput: true };
      }

      // ── List Reply — waits for user to select a row ───────────────────────
      case "listReply": {
        const header = d["header"] ? String(d["header"]) : undefined;
        const body = interpolate(String(d["body"] ?? ""), variables, contact);
        const footer = d["footer"] ? String(d["footer"]) : undefined;
        const buttonText = String(d["buttonText"] ?? "Select");
        const sections = (d["sections"] as Array<{
          title: string;
          rows: Array<{ id: string; title: string; description?: string }>;
        }> | undefined) ?? [];
        if (body && sections.length > 0) {
          await sendInteractiveList(phone, header, body, footer, buttonText, sections);
          await storeOutbound(userId, contactId, body);
        }
        return { waitForInput: true };
      }

      // ── Template ──────────────────────────────────────────────────────────
      case "template": {
        const templateName = String(d["templateName"] ?? "");
        const language = String(d["language"] ?? "en_US");
        const vars = (d["variables"] as Array<{ value: string }> | undefined) ?? [];
        if (templateName) {
          const components =
            vars.length > 0
              ? [
                  {
                    type: "body",
                    parameters: vars.map((v) => ({
                      type: "text",
                      text: interpolate(String(v.value ?? ""), variables, contact),
                    })),
                  },
                ]
              : undefined;
          await sendTemplateMessage(phone, templateName, language, components);
          await storeOutbound(userId, contactId, `[template: ${templateName}]`);
        }
        return {};
      }

      // ── Location ──────────────────────────────────────────────────────────
      case "location": {
        const action = String(d["action"] ?? "request");
        if (action === "request") {
          const message = String(d["message"] ?? "Please share your location.");
          await sendLocationRequest(phone, message);
          await storeOutbound(userId, contactId, message);
        } else {
          const lat = String(d["lat"] ?? "0");
          const lng = String(d["lng"] ?? "0");
          const name = d["locationName"] ? String(d["locationName"]) : undefined;
          await sendLocationMessage(phone, lat, lng, name);
          await storeOutbound(userId, contactId, `[location${name ? `: ${name}` : ""}]`);
        }
        return {};
      }

      // ── Flow Reply (send a WhatsApp Flow form) ────────────────────────────
      case "flowReply": {
        const metaFlowId = String(d["flowId"] ?? "");
        const headerText = d["headerText"] ? String(d["headerText"]) : undefined;
        const bodyText = String(d["bodyText"] ?? "Please complete the form below.");
        const ctaLabel = String(d["ctaLabel"] ?? "Open Form");
        if (metaFlowId) {
          await sendWhatsAppFlowMessage(phone, metaFlowId, userId, headerText, bodyText, ctaLabel);
          await storeOutbound(userId, contactId, bodyText);
        }
        return {};
      }

      // ── Condition — branches on contact fields or session variables ────────
      case "condition": {
        const conditions =
          (d["conditions"] as Array<{ field: string; operator: string; value: unknown }> | undefined) ?? [];
        const logicType = String(d["logicType"] ?? "AND");
        const results = conditions.map((c) => evaluateCondition(c, contact, variables));
        const passed = logicType === "OR" ? results.some(Boolean) : results.every(Boolean);
        return { edgeHandle: passed ? "true" : "false" };
      }

      // ── Tag — add or remove contact tags ─────────────────────────────────
      case "tag": {
        // Tags are stored as ObjectId refs; log for now — full resolution
        // would require a TagModel lookup by name, which varies per project.
        logger.info(
          { action: d["action"], tags: d["tags"], contactId: String(contactId) },
          "Chatbot tag node (skipped — tag name→ID resolution not yet wired)",
        );
        return {};
      }

      // ── Attribute — set contact fields or session variables ───────────────
      case "attribute": {
        const attrs =
          (d["attributes"] as Array<{ name: string; operator: string; value: unknown }> | undefined) ?? [];
        const contactPatch: Record<string, unknown> = {};

        for (const attr of attrs) {
          const val = interpolate(String(attr.value ?? ""), variables, contact);
          if (attr.operator === "set") {
            if (attr.name === "name" || attr.name === "email") {
              contactPatch[attr.name] = val;
            } else {
              variables[attr.name] = val;
            }
          } else if (attr.operator === "inc") {
            variables[attr.name] = Number(variables[attr.name] ?? 0) + Number(val);
          } else if (attr.operator === "dec") {
            variables[attr.name] = Number(variables[attr.name] ?? 0) - Number(val);
          }
        }

        if (Object.keys(contactPatch).length > 0) {
          await ContactModel.findByIdAndUpdate(contactId, { $set: contactPatch });
        }
        return {};
      }

      // ── Custom API call ───────────────────────────────────────────────────
      case "customApi": {
        const method = String(d["method"] ?? "GET");
        const url = interpolate(String(d["url"] ?? ""), variables, contact);
        const rawHeaders = (d["headers"] as Array<{ key: string; value: string }> | undefined) ?? [];
        const bodyStr = d["body"]
          ? interpolate(String(d["body"]), variables, contact)
          : undefined;
        const responseMapping =
          (d["responseMapping"] as Array<{ responsePath: string; variableName: string }> | undefined) ?? [];

        const headers: Record<string, string> = {};
        rawHeaders.forEach(({ key, value }) => {
          if (key.trim()) headers[key.trim()] = value;
        });

        if (url) {
          try {
            const res = await fetch(url, {
              method,
              headers,
              body: ["GET", "HEAD"].includes(method) ? undefined : bodyStr,
            });
            const data = (await res.json()) as Record<string, unknown>;
            for (const m of responseMapping) {
              const val = getNestedValue(data, m.responsePath);
              if (val !== undefined) variables[m.variableName] = val;
            }
          } catch (fetchErr) {
            logger.error({ fetchErr, url }, "Chatbot customApi node error");
          }
        }
        return {};
      }

      default:
        logger.info({ type: node.type }, "Chatbot node type not handled — skipping");
        return {};
    }
  } catch (err) {
    return { error: String(err) };
  }
}

// ── Condition Evaluator ────────────────────────────────────────────────────────

function evaluateCondition(
  condition: { field: string; operator: string; value: unknown },
  contact: Record<string, unknown>,
  variables: Record<string, unknown>,
): boolean {
  let actual: unknown;

  if (condition.field.startsWith("variable.")) {
    actual = variables[condition.field.slice("variable.".length)];
  } else if (condition.field.startsWith("contact.")) {
    actual = contact[condition.field.slice("contact.".length)];
  } else {
    actual = contact[condition.field] ?? variables[condition.field];
  }

  const aStr = String(actual ?? "").toLowerCase();
  const eStr = String(condition.value ?? "").toLowerCase();

  switch (condition.operator) {
    case "equals":       return aStr === eStr;
    case "not_equals":   return aStr !== eStr;
    case "contains":     return aStr.includes(eStr);
    case "not_contains": return !aStr.includes(eStr);
    case "starts_with":  return aStr.startsWith(eStr);
    case "ends_with":    return aStr.endsWith(eStr);
    case "is_empty":     return !actual || aStr === "";
    case "is_not_empty": return !!actual && aStr !== "";
    case "greater_than": return Number(actual) > Number(condition.value);
    case "less_than":    return Number(actual) < Number(condition.value);
    default:             return false;
  }
}

// ── WhatsApp Flow Message Sender ───────────────────────────────────────────────

async function sendWhatsAppFlowMessage(
  phone: string,
  metaFlowId: string,
  userId: mongoose.Types.ObjectId,
  headerText: string | undefined,
  bodyText: string,
  ctaLabel: string,
): Promise<void> {
  const accessToken = process.env["META_ACCESS_TOKEN"];
  const phoneNumberId = process.env["META_PHONE_NUMBER_ID"];
  if (!accessToken || !phoneNumberId) throw new Error("Meta credentials not configured");

  // Look up internal flow to generate a trackable token
  const internalFlow = await FlowModel.findOne({ metaFlowId, userId }).lean() as {
    _id: mongoose.Types.ObjectId;
    screens?: Array<{ id: string }>;
  } | null;

  const flowToken = internalFlow
    ? `flow_${String(internalFlow._id)}_${Date.now()}`
    : "unused";
  const firstScreen = internalFlow?.screens?.[0]?.id ?? "SCREEN_A";
  const normalizedPhone = phone.replace(/^\+/, "");

  const res = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: normalizedPhone,
      type: "interactive",
      interactive: {
        type: "flow",
        header: { type: "text", text: headerText ?? "Form" },
        body: { text: bodyText },
        footer: { text: "Powered by Airavata" },
        action: {
          name: "flow",
          parameters: {
            flow_message_version: "3",
            flow_token: flowToken,
            flow_id: metaFlowId,
            flow_cta: ctaLabel,
            flow_action: "navigate",
            flow_action_payload: { screen: firstScreen },
          },
        },
      },
    }),
  });

  if (!res.ok) {
    const err = (await res.json()) as { error?: { message?: string } };
    throw new Error(`Meta flow message error: ${err.error?.message ?? res.status}`);
  }
}

// ── Session Helpers ────────────────────────────────────────────────────────────

async function saveSession(contactId: mongoose.Types.ObjectId, session: Session) {
  await ContactModel.findByIdAndUpdate(contactId, { $set: { chatbotSession: session } });
}

async function clearSession(contactId: mongoose.Types.ObjectId) {
  await ContactModel.findByIdAndUpdate(contactId, { $unset: { chatbotSession: 1 } });
}

// ── Message Persistence ────────────────────────────────────────────────────────

async function storeOutbound(
  userId: mongoose.Types.ObjectId,
  contactId: mongoose.Types.ObjectId,
  body: string,
  extra?: Record<string, unknown>,
) {
  await MessageModel.create({
    userId,
    contactId,
    direction: "OUTBOUND",
    body,
    status: "SENT",
    sentAt: new Date(),
    ...extra,
  });
}

// ── Utilities ──────────────────────────────────────────────────────────────────

/** Replace {{key}} and {{contact.field}} placeholders with real values */
function interpolate(
  text: string,
  variables: Record<string, unknown>,
  contact: Record<string, unknown>,
): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (_, key: string) => {
    key = key.trim();
    if (key.startsWith("contact.")) {
      return String(contact[key.slice("contact.".length)] ?? "");
    }
    return String(variables[key] ?? contact[key] ?? "");
  });
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce((acc: unknown, key) => {
    if (acc !== null && typeof acc === "object") {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
