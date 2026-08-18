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
  getCredentials,
} from "./whatsapp";
import { resolvePricingLookupForUser } from "./pricing";

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
 * Directly execute a specific published chatbot flow by its MongoDB ID,
 * bypassing trigger resolution. Used when a template's linked chatbot is set.
 */
export async function runChatbotFlowById(
  flowId: string,
  contactId: mongoose.Types.ObjectId,
  userId: mongoose.Types.ObjectId,
  ctx: IncomingContext,
): Promise<void> {
  const contact = await ContactModel.findById(contactId).lean() as Record<string, unknown> | null;
  if (!contact) return;

  const flow = await ChatbotFlowModel.findOne({
    _id: new mongoose.Types.ObjectId(flowId),
    userId,
    status: "PUBLISHED",
  }).lean() as ChatbotFlow | null;

  if (!flow) {
    logger.warn({ flowId }, "Linked chatbot flow not found or not published");
    return;
  }

  const phone = (contact["phone"] as string).replace(/\s+/g, "");

  // Clear any existing session so the linked flow starts fresh
  await clearSession(contactId);

  const startNode = flow.nodes.find((n) => n.type === "start");
  const firstEdge = flow.edges.find((e) => e.source === startNode?.id);
  const startNodeId = firstEdge?.target ?? startNode?.id;

  if (!startNodeId) {
    logger.warn({ flowId }, "Linked chatbot flow has no start node");
    return;
  }

  // Store the button text as a session variable so the flow can branch on intent
  const variables: Record<string, unknown> = {};
  if (ctx.text) variables["intent"] = ctx.text;

  await executeFlow(flow, startNodeId, phone, contact, userId, contactId, variables);
}

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
        const replyVariables = { ...(session.variables ?? {}) };
        // Imported flows use the visible reply text in conditions and
        // attributes, while the ID is only used to resume the graph.
        if (ctx.text) {
          replyVariables["list_reply"] = ctx.text;
          replyVariables["button_reply"] = ctx.text;
          replyVariables["selected_option"] = ctx.text;
          replyVariables["selected_value"] = ctx.text;
        }
        replyVariables["list_reply_id"] = ctx.interactiveReplyId;
        replyVariables["button_reply_id"] = ctx.interactiveReplyId;
        replyVariables["selected_option_id"] = ctx.interactiveReplyId;
        replyVariables["selected_value_id"] = ctx.interactiveReplyId;

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
            flow, edge.target, phone, contact, userId, contactId, replyVariables,
          );
          return;
        }
      }

      // User sent a plain text message while mid-flow.
      const waitingNode = flow.nodes.find((n) => n.id === session.currentNodeId);
      if (ctx.text && waitingNode?.type === "question") {
        const variable = String(waitingNode.data["variable"] ?? "").trim();
        const nextVariables = { ...(session.variables ?? {}) };
        if (variable) {
          nextVariables[variable] =
            waitingNode.data["required"] === false &&
            ctx.text.trim().toLowerCase() === "skip"
              ? ""
              : ctx.text.trim();
        }
        const edge = flow.edges.find((e) => e.source === session.currentNodeId);
        if (edge) {
          await executeFlow(flow, edge.target, phone, contact, userId, contactId, nextVariables);
        } else {
          await clearSession(contactId);
        }
        return;
      }

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

/**
 * Resume a chatbot after a user submits a WhatsApp Flow form.
 *
 * A Flow Reply node deliberately pauses the chatbot session. Meta sends the
 * completed form back as an nfm_reply webhook, so the next edge in the
 * chatbot graph is executed only after the form has been submitted.
 */
export async function resumeChatbotAfterFlowSubmission(
  contactId: mongoose.Types.ObjectId,
  userId: mongoose.Types.ObjectId,
  submittedData: Record<string, unknown>,
): Promise<void> {
  const contact = await ContactModel.findById(contactId).lean() as Record<string, unknown> | null;
  if (!contact) return;

  const session = contact["chatbotSession"] as Session | undefined;
  if (!session?.flowId || !session.currentNodeId) {
    logger.warn({
      contactId: String(contactId),
      submittedKeys: Object.keys(submittedData),
    }, "Flow submitted without a paused chatbot session");
    return;
  }

  const flow = await ChatbotFlowModel.findOne({
    _id: new mongoose.Types.ObjectId(session.flowId),
    userId,
    status: "PUBLISHED",
  }).lean() as ChatbotFlow | null;

  if (!flow) {
    await clearSession(contactId);
    logger.warn({ flowId: session.flowId }, "Cannot resume chatbot after Flow submission");
    return;
  }

  // Meta may include submitted values under `data`; merge that object into the
  // top level so downstream chatbot nodes can use {{full_name}}, {{date}}, etc.
  const nestedData = submittedData["data"];
  const formValues =
    nestedData && typeof nestedData === "object" && !Array.isArray(nestedData)
      ? { ...submittedData, ...(nestedData as Record<string, unknown>) }
      : submittedData;
  const variables = { ...(session.variables ?? {}) };
  const internalKeys = new Set(["flow_token", "version", "source", "screen", "data"]);

  for (const [key, value] of Object.entries(formValues)) {
    if (!internalKeys.has(key)) variables[key] = value;
  }

  const nextEdge = flow.edges.find((edge) => edge.source === session.currentNodeId);
  if (!nextEdge) {
    logger.error({
      flowId: session.flowId,
      currentNodeId: session.currentNodeId,
      submittedKeys: Object.keys(submittedData),
    }, "Flow submission has no outgoing chatbot edge");
    await clearSession(contactId);
    return;
  }

  const phone = String(contact["phone"] ?? "").replace(/\s+/g, "");
  logger.info({
    flowId: session.flowId,
    currentNodeId: session.currentNodeId,
    nextNodeId: nextEdge.target,
    variableKeys: Object.keys(variables),
  }, "Resuming chatbot after WhatsApp Flow submission");
  await executeFlow(flow, nextEdge.target, phone, contact, userId, contactId, variables);
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
      logger.error({
        nodeId: node.id,
        nodeType: node.type,
        flowId: String(flow._id),
        error: result.error,
      }, "Chatbot node error — preserving session for retry");
      // Keep the session at the failed node. This is especially important for
      // Flow Reply nodes: if Meta rejects the outbound Flow message, a later
      // retry should not force the customer to restart the whole chatbot.
      await saveSession(contactId, {
        flowId: String(flow._id),
        currentNodeId: node.id,
        variables,
        startedAt: new Date(),
      });
      return;
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
          await sendTextMessage(phone, message, userId.toString());
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
          await sendMediaByUrl(phone, mediaType, mediaUrl, caption, undefined, userId.toString());
          await storeOutbound(userId, contactId, `[${mediaType}]`, { mediaType, mediaUrl });
        }
        return {};
      }

      // ── CTA Buttons — waits for user to press a button ───────────────────
      case "ctaButton": {
        const body = interpolate(String(d["body"] ?? ""), variables, contact);
        const footer = d["footer"] ? String(d["footer"]) : undefined;
        const buttons = (d["buttons"] as Array<{ id: string; title: string }> | undefined) ?? [];
        if (!body || buttons.length === 0) {
          logger.warn({ nodeId: node.id, body, buttonCount: buttons.length }, "ctaButton node skipped — body or buttons missing");
          return {}; // don't hang: advance to next node
        }
        logger.info({ nodeId: node.id, body, buttonCount: buttons.length }, "Sending interactive buttons");
        await sendInteractiveButtons(phone, body, footer, buttons, userId.toString());
        await storeOutbound(userId, contactId, body);
        return { waitForInput: true };
      }

      // ── List Reply — waits for user to select a row ───────────────────────
      case "listReply": {
        const header = d["header"] ? String(d["header"]) : undefined;
        const body = interpolate(String(d["body"] ?? ""), variables, contact);
        const footer = d["footer"] ? String(d["footer"]) : undefined;
        const buttonText = String(d["buttonText"] ?? "Select");
        const rawSections = (d["sections"] as Array<{
          title: string;
          rows: Array<{ id: string; title: string; description?: string }>;
        }> | undefined) ?? [];

        // Sanitize: ensure every section has a non-empty title (Meta rejects blank titles)
        // and filter out rows with empty titles.
        const sections = rawSections
          .map((s, i) => ({
            title: s.title?.trim() || `Section ${i + 1}`,
            rows: (s.rows ?? []).filter((r) => r.title?.trim()),
          }))
          .filter((s) => s.rows.length > 0);

        if (!body || sections.length === 0) {
          logger.warn(
            { nodeId: node.id, body, sectionCount: rawSections.length, sanitizedCount: sections.length },
            "listReply node skipped — body or sections missing/empty after sanitization",
          );
          return {}; // don't hang: advance to next node
        }
        logger.info(
          { nodeId: node.id, body, sectionCount: sections.length, rowCounts: sections.map((s) => s.rows.length) },
          "Sending interactive list",
        );
        await sendInteractiveList(phone, header, body, footer, buttonText, sections, userId.toString());
        await storeOutbound(userId, contactId, body);
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
          await sendTemplateMessage(phone, templateName, language, components, userId.toString());
          await storeOutbound(userId, contactId, `[template: ${templateName}]`);
        }
        return {};
      }

      // ── Location ──────────────────────────────────────────────────────────
      case "location": {
        const action = String(d["action"] ?? "request");
        if (action === "request") {
          const message = String(d["message"] ?? "Please share your location.");
          await sendLocationRequest(phone, message, userId.toString());
          await storeOutbound(userId, contactId, message);
        } else {
          const lat = String(d["lat"] ?? "0");
          const lng = String(d["lng"] ?? "0");
          const name = d["locationName"] ? String(d["locationName"]) : undefined;
          await sendLocationMessage(phone, lat, lng, name, userId.toString());
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
          // Do not advance yet. The webhook resumes this node's outgoing edge
          // once the user submits the form.
          return { waitForInput: true };
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
          (d["responseMapping"] as Array<Record<string, unknown>> | undefined) ?? [];

        const headers: Record<string, string> = {};
        rawHeaders.forEach(({ key, value }) => {
          if (key.trim()) headers[key.trim()] = value;
        });

        if (url) {
          try {
            const data = isBuiltInApiUrl(url)
              ? await executeBuiltInApi(url, bodyStr, variables, contact, userId)
              : await fetchExternalApi(url, method, headers, bodyStr);
            for (const m of responseMapping) {
              // Imported flows use path/variable; older saved flows used
              // responsePath/variableName. Accept both formats.
              const responsePath = String(
                m["path"] ?? m["responsePath"] ?? m["response_path"] ?? "",
              );
              const variableName = String(
                m["variable"] ?? m["variableName"] ?? m["variable_name"] ?? "",
              ).replace(/^\{\{|\}\}$/g, "").trim();
              if (!responsePath || !variableName) continue;
              const val = getNestedValue(data, responsePath);
              if (val !== undefined) variables[variableName] = val;
            }
          } catch (fetchErr) {
            logger.error({ fetchErr, url }, "Chatbot customApi node error");
          }
        }
        return {};
      }
      // ── Question — asks for free text and waits for the reply ────────────
      case "question": {
        const message = interpolate(String(d["question"] ?? ""), variables, contact);
        if (message) {
          await sendTextMessage(phone, message, userId.toString());
          await storeOutbound(userId, contactId, message);
        }
        return { waitForInput: true };
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
  flowReference: string,
  userId: mongoose.Types.ObjectId,
  headerText: string | undefined,
  bodyText: string,
  ctaLabel: string,
): Promise<void> {
  const { accessToken, phoneNumberId } = await getCredentials(userId.toString());

  // Look up internal flow to generate a trackable token
  // The chatbot UI stores our internal Flow document ID. Keep accepting a
  // Meta Flow ID as a backwards-compatible fallback for older saved nodes.
  const internalFlow = (
    mongoose.Types.ObjectId.isValid(flowReference)
      ? await FlowModel.findOne({ _id: new mongoose.Types.ObjectId(flowReference), userId, status: "PUBLISHED" }).lean()
      : null
  ) ?? await FlowModel.findOne({ metaFlowId: flowReference, userId, status: "PUBLISHED" }).lean() as {
    _id: mongoose.Types.ObjectId;
    metaFlowId?: string;
    screens?: Array<{ id: string }>;
  } | null;

  if (!internalFlow?.metaFlowId) {
    throw new Error("Select a published WhatsApp Flow before sending this chatbot node");
  }

  const flowToken = internalFlow
    ? `flow_${String(internalFlow._id)}_${Date.now()}`
    : "unused";
  const firstScreen = sanitizeFlowScreenId(internalFlow?.screens?.[0]?.id ?? "SCREEN_A");
  const normalizedPhone = phone.replace(/^\+/, "");
  logger.info({
    to: normalizedPhone,
    flowReference,
    internalFlowId: String(internalFlow._id),
    metaFlowId: internalFlow.metaFlowId,
    firstScreen,
  }, "Sending WhatsApp Flow message to Meta");

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
            flow_id: internalFlow.metaFlowId,
            flow_cta: ctaLabel,
            flow_action: "navigate",
            flow_action_payload: { screen: firstScreen },
          },
        },
      },
    }),
  });

  if (!res.ok) {
    const raw = await res.text();
    let err: { error?: { message?: string; code?: number; error_subcode?: number; fbtrace_id?: string } } = {};
    try {
      err = JSON.parse(raw) as typeof err;
    } catch {
      // Keep the raw response in the thrown error below.
    }
    logger.error({
      status: res.status,
      raw,
      metaError: err.error,
      to: normalizedPhone,
      metaFlowId: internalFlow.metaFlowId,
    }, "Meta rejected WhatsApp Flow message");
    throw new Error(`Meta flow message error: ${err.error?.message ?? raw ?? String(res.status)}`);
  }
  logger.info({ to: normalizedPhone, metaFlowId: internalFlow.metaFlowId }, "Meta accepted WhatsApp Flow message");
}

const FLOW_DIGIT_WORDS = ["ZERO", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE"];

function sanitizeFlowScreenId(id: string): string {
  return id.replace(/\d/g, (digit) => FLOW_DIGIT_WORDS[Number(digit)] ?? digit);
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
  const normalizedPath = path
    .trim()
    .replace(/^\$\.?/, "")
    .replace(/\[(\d+)\]/g, ".$1")
    .replace(/^\./, "");
  if (!normalizedPath) return obj;
  return normalizedPath.split(".").reduce((acc: unknown, key) => {
    if (acc !== null && typeof acc === "object") {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function isBuiltInApiUrl(url: string): boolean {
  const normalized = url.trim().toLowerCase();
  return normalized === "airavata://pricing/lookup" ||
    normalized === "/api/chatbot/pricing/lookup" ||
    normalized.includes("your-backend.example.com/api/pricing/lookup") ||
    normalized.includes("webhook.site/your-unique-url");
}

async function executeBuiltInApi(
  url: string,
  bodyStr: string | undefined,
  variables: Record<string, unknown>,
  contact: Record<string, unknown>,
  userId: mongoose.Types.ObjectId,
): Promise<Record<string, unknown>> {
  const normalized = url.trim().toLowerCase();
  let body: Record<string, unknown> = {};
  if (bodyStr) {
    try {
      const parsed = JSON.parse(bodyStr) as unknown;
      if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
    } catch {
      logger.warn({ url }, "Built-in chatbot API received a non-JSON body");
    }
  }

  if (
    normalized === "airavata://pricing/lookup" ||
    normalized === "/api/chatbot/pricing/lookup" ||
    normalized.includes("your-backend.example.com/api/pricing/lookup")
  ) {
    return await resolvePricingLookupForUser(userId, {
      car_category: body["car_category"] ?? variables["car_category"] ?? contact["car_category"],
      service: body["service"] ?? body["selected_service"] ?? variables["selected_service"],
    }) as unknown as Record<string, unknown>;
  }

  // Keep imported demo booking flows usable without sending data to a fake
  // webhook.site URL. This is a local acknowledgement, not an external CRM.
  return {
    booking_id: `AD-${Date.now().toString(36).toUpperCase()}`,
    accepted: true,
  };
}

async function fetchExternalApi(
  url: string,
  method: string,
  headers: Record<string, string>,
  bodyStr: string | undefined,
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method,
    headers,
    body: ["GET", "HEAD"].includes(method) ? undefined : bodyStr,
  });
  const contentType = res.headers.get("content-type") ?? "";
  const data = contentType.includes("json")
    ? await res.json()
    : { body: await res.text() };
  if (!res.ok) throw new Error(`Custom API returned ${res.status}`);
  return (data && typeof data === "object")
    ? data as Record<string, unknown>
    : { data };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
