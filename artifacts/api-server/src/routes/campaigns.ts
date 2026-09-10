/**
 * Module 8: Campaigns — Create, launch, and report.
 * Sending deducts 1 credit per recipient and stores per-message records.
 */

import { Router } from "express";
import mongoose from "mongoose";
import { CampaignModel } from "../models/Campaign";
import { ContactModel } from "../models/Contact";
import { TemplateModel } from "../models/Template";
import { FlowModel } from "../models/Flow";
import { MessageModel } from "../models/Message";
import { CampaignRecipientModel } from "../models/CampaignRecipient";
import { CampaignSendModel } from "../models/CampaignSend";
import { authenticate, type AuthRequest } from "../middlewares/authenticate";
import { logger } from "../lib/logger";
import { executeCampaignSend } from "../lib/campaignExecutor";
import { resolveAudience } from "../lib/audienceResolver";
import { getMetaMessagingAnalytics } from "../lib/whatsapp";
import {
  enrollContactsInTriggerCampaign,
  enrollNewContactsInTriggerCampaigns,
} from "../lib/triggerEnrollment";
import { emitContactCreatedEvents } from "../lib/clientWebhooks";
import { normalizeContactPhone, sameContactPhone } from "../lib/contactPhone";
import { validateTemplateParameters } from "../lib/templateComponents";

const router = Router();
const TRIGGER_EVENTS = new Set(["inbound_message", "contact_created", "tag_added"]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function shapeCampaign(
  c: Record<string, unknown> & { _id: unknown; templateId?: unknown },
  statsOverride?: unknown,
) {
  return {
    id: String(c._id),
    name: c.name,
    type: c.type ?? "QUICK",
    templateId: c.templateId ? String(c.templateId) : null,
    templateName:
      (c as Record<string, unknown> & { template?: Array<{ name: string }> })
        .template?.[0]?.name ?? null,
    audience: c.audience,
    variableValues: c.variableValues,
    scheduledAt: c.scheduledAt,
    status: c.status,
    stats: statsOverride ?? c.stats,
    creditCost: c.creditCost,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function getMetaErrorDetails(response: unknown, failureReason?: string) {
  const error = asRecord(asRecord(response).error);
  const code = typeof error.code === "number" || typeof error.code === "string"
    ? String(error.code)
    : failureReason?.match(/\bcode=([0-9]+)\b/)?.[1] ?? null;
  const reason =
    (typeof error.message === "string" ? error.message : null) ??
    failureReason ??
    null;
  return { code, reason };
}

function buildTemplateRequestFallback(
  template: Record<string, unknown>,
  phoneNumber: string,
  variableValues: unknown,
) {
  const values = asRecord(variableValues);
  const indices = Object.keys(values)
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const components = indices.length
    ? [{
        type: "body",
        parameters: indices.map((index) => ({
          type: "text",
          text: String(values[String(index)] ?? "")
            .replace(/\{\{name\}\}/gi, "")
            .replace(/\{\{phone\}\}/gi, phoneNumber),
        })),
      }]
    : undefined;

  return {
    method: "POST",
    path: null,
    body: {
      messaging_product: "whatsapp",
      to: phoneNumber.replace(/\D/g, ""),
      type: "template",
      template: {
        name: template.name ?? null,
        language: { code: template.language ?? "en_US" },
        ...(components?.length ? { components } : {}),
      },
    },
    reconstructed: true,
  };
}

interface ReconciledCampaignCounts {
  sent: number;
  delivered: number;
  read: number;
  failed: number;
}

/**
 * Rebuild report counters from the latest state of each campaign send.
 *
 * Campaign.stats is maintained incrementally for fast writes, but webhook
 * delivery notifications can be retried by Meta. The message state is the
 * idempotent source of truth, so reports use per-send status rows to repair
 * both old inflated counters and any future duplicate notifications.
 */
async function getReconciledCampaignCounts(
  userId: mongoose.Types.ObjectId,
  campaignIds: mongoose.Types.ObjectId[],
): Promise<Map<string, ReconciledCampaignCounts>> {
  if (campaignIds.length === 0) return new Map();

  const rows = await CampaignSendModel.aggregate<{
    _id: mongoose.Types.ObjectId;
    sent: number;
    delivered: number;
    read: number;
    failed: number;
  }>([
    {
      $match: {
        userId,
        campaignId: { $in: campaignIds },
      },
    },
    { $sort: { updatedAt: 1, _id: 1 } },
    {
      $group: {
        _id: {
          campaignId: "$campaignId",
          sendKey: { $toString: "$_id" },
        },
        status: { $last: "$status" },
      },
    },
    {
      $group: {
        _id: "$_id.campaignId",
        sent: {
          $sum: {
            $cond: [
              {
                $or: [
                  { $in: ["$status", ["SENT", "DELIVERED", "READ"]] },
                ],
              },
              1,
              0,
            ],
          },
        },
        delivered: {
          $sum: {
            $cond: [{ $in: ["$status", ["DELIVERED", "READ"]] }, 1, 0],
          },
        },
        read: {
          $sum: {
            $cond: [{ $eq: ["$status", "READ"] }, 1, 0],
          },
        },
        failed: {
          $sum: {
            $cond: [{ $eq: ["$status", "FAILED"] }, 1, 0],
          },
        },
      },
    },
  ]);

  return new Map(
    rows.map((row) => [
      String(row._id),
      {
        sent: row.sent ?? 0,
        delivered: row.delivered ?? 0,
        read: row.read ?? 0,
        failed: row.failed ?? 0,
      },
    ]),
  );
}

function statsForCampaign(
  campaign: Record<string, unknown> & { _id: unknown },
  reconciledCounts: Map<string, ReconciledCampaignCounts>,
): unknown {
  const counts = reconciledCounts.get(String(campaign._id));
  const storedStats =
    campaign.stats && typeof campaign.stats === "object"
      ? (campaign.stats as Record<string, unknown>)
      : {};
  return {
    ...storedStats,
    ...(counts ?? { sent: 0, delivered: 0, read: 0, failed: 0 }),
  };
}

type CsvCampaignContactInput = {
  phone?: unknown;
  name?: unknown;
  email?: unknown;
  attributes?: unknown;
};

type ResolvedCsvContact = {
  _id: mongoose.Types.ObjectId;
  name: string;
  phone: string;
  status: "active" | "blocked" | "unsubscribed";
};

function normalizeCampaignPhone(value: unknown): string | null {
  try {
    return normalizeContactPhone(value);
  } catch {
    return null;
  }
}

function canonicalPhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

/**
 * Resolve CSV numbers inside the tenant transaction. Existing contacts are
 * reused regardless of status so blocked/unsubscribed contacts cannot be
 * bypassed by creating a second contact with the same number.
 */
async function resolveCsvContacts(
  userId: mongoose.Types.ObjectId,
  rows: CsvCampaignContactInput[],
  session: mongoose.ClientSession,
): Promise<{
  contacts: ResolvedCsvContact[];
  created: ResolvedCsvContact[];
  invalid: string[];
}> {
  const uniqueRows = new Map<string, {
    phone: string;
    name?: string;
    email?: string;
    attributes?: Record<string, string>;
  }>();
  const invalid: string[] = [];

  for (const row of rows) {
    const rawPhone = String(row.phone ?? "").trim();
    const phone = normalizeCampaignPhone(rawPhone);
    if (!phone) {
      if (rawPhone) invalid.push(rawPhone);
      continue;
    }

    const key = canonicalPhone(phone);
    if (uniqueRows.has(key)) continue;

    const attributes =
      row.attributes && typeof row.attributes === "object"
        ? Object.fromEntries(
            Object.entries(row.attributes as Record<string, unknown>)
              .map(([key, value]) => [key, String(value ?? "").trim()])
              .filter(([, value]) => value),
          )
        : undefined;
    const name = String(row.name ?? "").trim();
    const email = String(row.email ?? "").trim();
    uniqueRows.set(key, {
      phone,
      ...(name ? { name } : {}),
      ...(email ? { email } : {}),
      ...(attributes && Object.keys(attributes).length ? { attributes } : {}),
    });
  }

  const entries = [...uniqueRows.values()];
  if (!entries.length) return { contacts: [], created: [], invalid };

  // Include common formatted variants when matching legacy/imported contacts.
  const phoneVariants = [
    ...new Set(
      entries.flatMap(({ phone }) => {
        const digits = canonicalPhone(phone);
        return [phone, digits, `+${digits}`];
      }),
    ),
  ];
  const existing = await ContactModel.find({ userId })
    .select("_id name phone status")
    .session(session)
    .lean();
  const existingByPhone = new Map<string, ResolvedCsvContact>();
  for (const contact of existing) {
    const key = normalizeContactPhone(contact.phone);
    if (!existingByPhone.has(key)) {
      existingByPhone.set(key, {
        _id: contact._id as mongoose.Types.ObjectId,
        name: contact.name,
        phone: normalizeContactPhone(contact.phone),
        status: contact.status,
      });
    }
  }

  const newEntries = entries.filter(
    entry => !existingByPhone.has(canonicalPhone(entry.phone)),
  );
  let created: ResolvedCsvContact[] = [];
  if (newEntries.length) {
    const inserted = await ContactModel.insertMany(
      newEntries.map(entry => ({
        userId,
        name: entry.name || entry.phone,
        phone: entry.phone,
        ...(entry.email ? { email: entry.email } : {}),
        ...(entry.attributes ? { attributes: entry.attributes } : {}),
        status: "active",
      })),
      { ordered: true, session },
    );
    created = inserted.map(contact => ({
      _id: contact._id as mongoose.Types.ObjectId,
      name: contact.name,
      phone: contact.phone,
      status: contact.status,
    }));
    await enrollNewContactsInTriggerCampaigns(
      userId,
      created.map((contact) => contact._id),
      { session },
    );
  }

  return {
    contacts: [
      ...entries
        .map(entry => existingByPhone.get(canonicalPhone(entry.phone)))
        .filter((contact): contact is ResolvedCsvContact => Boolean(contact)),
      ...created,
    ],
    created,
    invalid,
  };
}

/** Resolve all unique contacts for a campaign's audience (contactIds + groups) */
async function resolveRecipients(
  userId: mongoose.Types.ObjectId,
  contactIds: string[],
  groupIds: string[],
): Promise<
  Array<{ _id: mongoose.Types.ObjectId; name: string; phone: string }>
> {
  const byId = contactIds.length
    ? await ContactModel.find({
        userId,
        _id: { $in: contactIds.map((id) => new mongoose.Types.ObjectId(id)) },
        status: "active",
      })
        .select("_id name phone")
        .lean()
    : [];

  const byGroup = groupIds.length
    ? await ContactModel.find({
        userId,
        groupId: { $in: groupIds.map((id) => new mongoose.Types.ObjectId(id)) },
        status: "active",
      })
        .select("_id name phone")
        .lean()
    : [];

  // Deduplicate by _id
  const seen = new Set<string>();
  const all: Array<{
    _id: mongoose.Types.ObjectId;
    name: string;
    phone: string;
  }> = [];
  for (const c of [...byId, ...byGroup]) {
    const key = String(c._id);
    if (!seen.has(key)) {
      seen.add(key);
      all.push({
        _id: c._id as mongoose.Types.ObjectId,
        name: c.name,
        phone: c.phone,
      });
    }
  }
  return all;
}

/** Substitute {{N}} placeholders in the template body for display in live chat */
function resolveBody(
  body: string,
  variableValues: Record<string, string>,
  contact: { name: string; phone: string },
): string {
  return body.replace(/\{\{(\d+)\}\}/g, (_, index: string) => {
    let value = variableValues[index] ?? "";
    value = value.replace(/\{\{name\}\}/gi, contact.name);
    value = value.replace(/\{\{phone\}\}/gi, contact.phone);
    return value || `{{${index}}}`;
  });
}

// ── GET /api/campaigns ────────────────────────────────────────────────────────

router.get("/campaigns", authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user!.userId);

    const campaigns = await CampaignModel.aggregate([
      { $match: { userId } },
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: "templates",
          localField: "templateId",
          foreignField: "_id",
          as: "template",
        },
      },
    ]);

    const reconciledCounts = await getReconciledCampaignCounts(
      userId,
      campaigns.map((campaign) => campaign._id as mongoose.Types.ObjectId),
    );
    res.json({
      campaigns: campaigns.map((campaign) =>
        shapeCampaign(campaign, statsForCampaign(campaign, reconciledCounts)),
      ),
    });
  } catch (err: unknown) {
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

// ── GET /api/campaigns/:id ────────────────────────────────────────────────────

router.get("/campaigns/:id", authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user!.userId);

    const [campaign] = await CampaignModel.aggregate([
      {
        $match: {
          _id: new mongoose.Types.ObjectId(req.params.id),
          userId,
        },
      },
      {
        $lookup: {
          from: "templates",
          localField: "templateId",
          foreignField: "_id",
          as: "template",
        },
      },
    ]);

    if (!campaign) return res.status(404).json({ error: "Campaign not found" });

    const reconciledCounts = await getReconciledCampaignCounts(
      userId,
      [campaign._id as mongoose.Types.ObjectId],
    );

    // Per-recipient breakdown (latest 200 messages)
    const messages = await MessageModel.find({
      campaignId: new mongoose.Types.ObjectId(req.params.id),
      userId,
    })
      .populate("contactId", "name phone")
      .limit(200)
      .lean();

    const sends = await CampaignSendModel.find({
      campaignId: new mongoose.Types.ObjectId(req.params.id),
      userId,
    })
      .populate("contactId", "name phone")
      .sort({ createdAt: 1 })
      .limit(5000)
      .lean();

    const template = asRecord(asRecord(campaign).template?.[0]);
    const messageDetails = sends.map((send) => {
      const contact = asRecord(send.contactId);
      const error = getMetaErrorDetails(send.responsePayload, send.failureReason);
      const phoneNumber = typeof contact.phone === "string" ? contact.phone : "—";
      const request = send.requestPayload ??
        (template.name ? buildTemplateRequestFallback(template, phoneNumber, campaign.variableValues) : null);
      const response = send.responsePayload ??
        (send.whatsappMessageId
          ? { messages: [{ id: send.whatsappMessageId }], reconstructed: true }
          : send.failureReason
            ? { error: { message: send.failureReason }, reconstructed: true }
            : null);
      return {
        id: String(send._id),
        phoneNumber,
        contactName: typeof contact.name === "string" ? contact.name : null,
        status: send.status,
        messageId: send.whatsappMessageId ?? null,
        updatedAt: send.updatedAt,
        errorCode: error.code,
        errorReason: error.reason,
        request,
        response,
      };
    });

    const requestPayloads = messageDetails
      .map((detail) => detail.request)
      .filter(Boolean);

    res.json({
      campaign: shapeCampaign(campaign, statsForCampaign(campaign, reconciledCounts)),
      messages,
      messageDetails,
      apiRequest: {
        templateName: template.name ?? null,
        language: template.language ?? null,
        variables: campaign.variableValues ?? {},
        phoneNumbers: messageDetails.map((detail) => detail.phoneNumber),
        payloads: requestPayloads,
      },
      rawResponses: messageDetails.map((detail) => ({
        phoneNumber: detail.phoneNumber,
        messageId: detail.messageId,
        status: detail.status,
        response: detail.response,
      })),
    });
  } catch (err: unknown) {
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

router.get("/campaigns/:id/recipients", authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user!.userId);
    const campaignId = new mongoose.Types.ObjectId(req.params.id);
    const campaign = await CampaignModel.exists({ _id: campaignId, userId });
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });
    const recipients = await CampaignRecipientModel.find({ campaignId, userId })
      .populate("contactId", "name phone")
      .sort({ createdAt: 1 })
      .lean();
    res.json({ recipients });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/campaigns/:id/enroll", authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user!.userId);
    const campaign = await CampaignModel.findOne({ _id: req.params.id, userId }).lean();
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });
    if (campaign.type !== "TRIGGER") return res.status(400).json({ error: "Only Trigger campaigns can be event-enrolled" });
    const { contactIds = [] } = req.body as { contactIds?: string[] };
    const result = await enrollContactsInTriggerCampaign(
      userId,
      campaign._id as mongoose.Types.ObjectId,
      Array.isArray(contactIds) ? contactIds : [],
    );
    return res.status(result.enrolled > 0 ? 201 : 200).json(result);
  } catch {
    res.status(500).json({ error: "Unable to enroll trigger contacts" });
  }
});

// ── GET /api/contacts/:contactId/campaigns ───────────────────────────────────
// Return campaigns that have actually run for this contact, with the latest
// per-recipient WhatsApp status (SENT, DELIVERED, READ, or FAILED).
router.get("/contacts/:contactId/campaigns", authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user!.userId);
    const contactId = new mongoose.Types.ObjectId(req.params.contactId);

    const messages = await MessageModel.find({
      userId,
      contactId,
      campaignId: { $exists: true, $ne: null },
    })
      .sort({ createdAt: -1 })
      .select("campaignId status createdAt sentAt deliveredAt readAt")
      .lean();

    const latestByCampaign = new Map<string, (typeof messages)[number]>();
    for (const message of messages) {
      const campaignId = String(message.campaignId);
      if (!latestByCampaign.has(campaignId)) latestByCampaign.set(campaignId, message);
    }

    const campaignIds = [...latestByCampaign.keys()].map(id => new mongoose.Types.ObjectId(id));
    const campaigns = await CampaignModel.find({ _id: { $in: campaignIds }, userId })
      .populate("templateId", "name")
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      campaigns: campaigns.map(campaign => {
        const message = latestByCampaign.get(String(campaign._id));
        const template = campaign.templateId as unknown as { name?: string } | null;
        return {
          id: String(campaign._id),
          name: campaign.name,
          templateName: template?.name ?? null,
          status: campaign.status,
          recipientStatus: message?.status ?? "QUEUED",
          sentAt: message?.sentAt ?? null,
          deliveredAt: message?.deliveredAt ?? null,
          readAt: message?.readAt ?? null,
          createdAt: campaign.createdAt,
        };
      }),
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

// ── POST /api/campaigns ───────────────────────────────────────────────────────
// Creates and immediately launches (or schedules) a campaign.

router.post("/campaigns", authenticate, async (req: AuthRequest, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userId = new mongoose.Types.ObjectId(req.user!.userId);
    const {
      name,
      type = "QUICK",
      templateId,
      flowId,
      contactIds = [],
      groupIds = [],
      variableValues = {},
      headerValues = {},
      scheduledAt,
      phoneNumbers = [],
      csvContacts = [],
      tagId,
      tagIds = [],
      segmentId,
      filter,
      steps = [],
      trigger,
    } = req.body as {
      name: string;
      type?: "QUICK" | "CSV" | "SEGMENT" | "FLOW" | "DRIP" | "TRIGGER";
      templateId?: string;
      flowId?: string;
      contactIds?: string[];
      groupIds?: string[];
      variableValues?: Record<string, string>;
      headerValues?: Record<string, string>;
      scheduledAt?: string;
      phoneNumbers?: string[];
      csvContacts?: CsvCampaignContactInput[];
      tagId?: string;
      tagIds?: string[];
      segmentId?: string;
      filter?: Record<string, unknown>;
      steps?: Array<Record<string, unknown>>;
      trigger?: Record<string, unknown>;
    };
    const isCsvCampaign = type === "CSV";
    const isFlowCampaign = type === "FLOW";
    let normalizedTrigger: { event: string } | undefined;

    if (type === "TRIGGER") {
      const requestedEvent =
        typeof trigger?.event === "string" ? trigger.event : "";
      const canonicalEvent =
        requestedEvent === "new_contact_added" ? "contact_created" : requestedEvent;
      if (!TRIGGER_EVENTS.has(canonicalEvent)) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          error: "A valid trigger event is required",
          allowedEvents: [...TRIGGER_EVENTS],
        });
      }
      normalizedTrigger = { event: canonicalEvent };
    }

    if (!name || (!templateId && !(isFlowCampaign && flowId))) {
      return res
        .status(400)
        .json({
          error: isFlowCampaign
            ? "name and flowId are required"
            : "name and templateId are required",
        });
    }

    let template = null;
    let flow = null;
    if (isFlowCampaign) {
      if (!flowId || !mongoose.isValidObjectId(flowId)) {
        return res.status(400).json({ error: "A valid flowId is required" });
      }
      flow = await FlowModel.findOne({ _id: flowId, userId }).lean();
      if (!flow) return res.status(404).json({ error: "Flow not found" });
      if (flow.status !== "PUBLISHED" || !flow.metaFlowId) {
        return res.status(400).json({ error: "Flow must be published before sending" });
      }
    } else {
      // Validate template belongs to user and is APPROVED
      template = await TemplateModel.findOne({
        _id: templateId,
        userId,
      }).lean();
      if (!template) return res.status(404).json({ error: "Template not found" });
      if (String(template.status).toUpperCase() !== "APPROVED") {
        return res
          .status(400)
          .json({ error: "Only APPROVED templates can be used in campaigns" });
      }
      const missingParameters = validateTemplateParameters(
        template,
        variableValues,
        headerValues,
      );
      if (missingParameters.length > 0) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          error: `Missing required template parameters: ${missingParameters.join(", ")}`,
          missingParameters,
        });
      }
    }

    // Resolve contacts by raw phone numbers (Quick / Tags / Flow campaigns)
    let phoneContactIds: string[] = [];
    let createdContactIdsForWebhook: mongoose.Types.ObjectId[] = [];
    if (isCsvCampaign) {
      const csvRows = Array.isArray(csvContacts) && csvContacts.length
        ? csvContacts
        : (Array.isArray(phoneNumbers) ? phoneNumbers.map(phone => ({ phone })) : []);
      const csvResolution = await resolveCsvContacts(userId, csvRows, session);
      if (csvResolution.invalid.length > 0) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          error: `CSV contains invalid phone numbers: ${csvResolution.invalid.slice(0, 5).join(", ")}`,
        });
      }
      createdContactIdsForWebhook = csvResolution.created.map((contact) => contact._id);
      phoneContactIds = csvResolution.contacts
        .filter(contact => contact.status === "active")
        .map(contact => String(contact._id));
    } else if (phoneNumbers.length > 0) {
      const normalizedPhoneNumbers = phoneNumbers.flatMap((phone) => {
        try {
          return [normalizeContactPhone(phone)];
        } catch {
          return [];
        }
      });
      const allContacts = await ContactModel.find({ userId, status: "active" })
        .select("_id")
        .lean();
      const contactPhones = await ContactModel.find({ userId, status: "active" })
        .select("_id phone")
        .lean();
      phoneContactIds = contactPhones
        .filter((contact) =>
          normalizedPhoneNumbers.some((phone) => sameContactPhone(contact.phone, phone)),
        )
        .map((c) => String(c._id));
    }

    // Resolve contacts by tag
    let tagContactIds: string[] = [];
    if (tagId) {
      const byTag = await ContactModel.find({
        userId,
        tags: new mongoose.Types.ObjectId(tagId),
        status: "active",
      })
        .select("_id")
        .lean();
      tagContactIds = byTag.map((c) => String(c._id));
    }

    const audienceContacts = segmentId || filter || tagIds.length
      ? await resolveAudience(userId, {
          contactIds: [...contactIds, ...phoneContactIds],
          groupIds,
          tagIds: tagIds.length ? tagIds : tagId ? [tagId] : [],
          segmentId,
          filter: filter as never,
        })
      : null;
    const allContactIds = [
      ...new Set([...contactIds, ...phoneContactIds, ...tagContactIds]),
    ];

    const recipients = audienceContacts ?? await resolveRecipients(userId, allContactIds, groupIds);
    if (recipients.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ error: "No active contacts found for the selected audience" });
    }

    // Create campaign record
    const isScheduled = !!scheduledAt && new Date(scheduledAt) > new Date();
    const deferred = isScheduled || type === "DRIP" || type === "TRIGGER" || isFlowCampaign;
    const campaign = await CampaignModel.create(
      [
        {
          userId,
          name,
          type,
          ...(templateId ? { templateId: new mongoose.Types.ObjectId(templateId) } : {}),
          ...(flowId ? { flowId: new mongoose.Types.ObjectId(flowId) } : {}),
          audience: {
            contactIds: contactIds.map((id) => new mongoose.Types.ObjectId(id)),
            groupIds: groupIds.map((id) => new mongoose.Types.ObjectId(id)),
            ...(segmentId ? { segmentId: new mongoose.Types.ObjectId(segmentId) } : {}),
            ...(filter ? { filter } : {}),
          },
          variableValues,
          headerValues,
          scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
          status: deferred ? "SCHEDULED" : "SENDING",
          ...(steps.length ? { steps } : {}),
          ...(normalizedTrigger ? { trigger: normalizedTrigger } : {}),
          stats: {
            totalRecipients: recipients.length,
            sent: 0,
            delivered: 0,
            read: 0,
            failed: 0,
          },
          creditCost: recipients.length,
        },
      ],
      { session },
    );

    const camp = campaign[0]!;
    const enrolledRecipients = await CampaignRecipientModel.insertMany(
      recipients.map((contact) => ({
        userId,
        campaignId: camp._id,
        contactId: contact._id,
        status: deferred ? "QUEUED" : "ACTIVE",
        currentStepId: "initial",
        ...(type === "TRIGGER"
          ? {}
          : { nextActionAt: scheduledAt ? new Date(scheduledAt) : new Date() }),
      })),
      { ordered: false, session },
    );

    await session.commitTransaction();
    session.endSession();
    if (createdContactIdsForWebhook.length > 0) {
      void emitContactCreatedEvents(userId, createdContactIdsForWebhook);
    }

    // Respond immediately so the UI isn't blocked
    res.status(201).json({
      campaign: {
        id: String(camp._id),
        name: camp.name,
        status: camp.status,
        stats: camp.stats,
        creditCost: camp.creditCost,
      },
    });

    if (deferred) return;

    // ── Send through the shared executor asynchronously ──────────────────────
    let sent = 0;
    let failed = 0;
    let limitDeferred = false;
    for (const recipient of enrolledRecipients) {
      try {
        const result = await executeCampaignSend({
          userId,
          campaignId: camp._id,
          recipientId: recipient._id,
          contactId: recipient.contactId,
          templateId: template._id,
          variableValues,
          headerValues,
        });
        if ("deferred" in result && result.deferred) {
          limitDeferred = true;
          break;
        }
        if ("sent" in result && result.sent) sent++;
      } catch (err) {
        failed++;
        logger.error({ err, recipientId: String(recipient._id) }, "Shared campaign executor failed");
      }
    }
    await CampaignModel.findOneAndUpdate(
      { _id: camp._id, userId },
      {
        $set: {
          status: limitDeferred
            ? "SENDING"
            : failed > 0 && sent === 0
              ? "FAILED"
              : "COMPLETED",
        },
      },
    );
    logger.info({ campaignId: String(camp._id), sent, failed, deferred: limitDeferred }, "Campaign completed");
  } catch (err: unknown) {
    await session.abortTransaction().catch(() => {});
    session.endSession();
    if (!res.headersSent) {
      res
        .status(500)
        .json({ error: err instanceof Error ? err.message : "Unknown error" });
    }
  }
});

// ── Dashboard stats ───────────────────────────────────────────────────────────

router.get(
  "/campaigns/stats/summary",
  authenticate,
  async (req: AuthRequest, res) => {
    try {
      const userId = new mongoose.Types.ObjectId(req.user!.userId);

      const campaigns = await CampaignModel.find({ userId })
        .select("_id stats")
        .lean();
      const reconciledCounts = await getReconciledCampaignCounts(
        userId,
        campaigns.map((campaign) => campaign._id as mongoose.Types.ObjectId),
      );
      const stats = campaigns.reduce(
        (totals, campaign) => {
          const campaignStats = statsForCampaign(campaign, reconciledCounts) as {
            sent?: number;
            delivered?: number;
            read?: number;
            failed?: number;
          };
          totals.totalSent += campaignStats.sent ?? 0;
          totals.totalDelivered += campaignStats.delivered ?? 0;
          totals.totalRead += campaignStats.read ?? 0;
          totals.totalFailed += campaignStats.failed ?? 0;
          return totals;
        },
        {
          totalSent: 0,
          totalDelivered: 0,
          totalRead: 0,
          totalFailed: 0,
          campaignCount: campaigns.length,
        },
      );

      res.json({
        stats,
      });
    } catch (err: unknown) {
      res
        .status(500)
        .json({ error: err instanceof Error ? err.message : "Unknown error" });
    }
  },
);

/**
 * Dashboard messaging totals.
 *
 * Unlike campaign reports, this includes every unique outbound WhatsApp
 * message in the tenant: test templates, Live Chat replies, Flow messages,
 * chatbot sends, and campaign messages. The latest persisted status for each
 * WhatsApp message is the source of truth, so Meta's duplicate status
 * webhooks cannot inflate the overview.
 */
router.get(
  "/messages/stats/summary",
  authenticate,
  async (req: AuthRequest, res) => {
    try {
      const userId = new mongoose.Types.ObjectId(req.user!.userId);
      const hasMessageId = {
        $and: [
          { $ne: ["$whatsappMessageId", null] },
          { $ne: ["$whatsappMessageId", ""] },
        ],
      };

      const [row] = await MessageModel.aggregate<{
        totalSent: number;
        totalDelivered: number;
        totalRead: number;
        totalFailed: number;
      }>([
        {
          $match: {
            userId,
            direction: "OUTBOUND",
          },
        },
        { $sort: { updatedAt: 1, _id: 1 } },
        {
          $group: {
            _id: {
              $cond: [hasMessageId, "$whatsappMessageId", { $toString: "$_id" }],
            },
            status: { $last: "$status" },
            hasWhatsappMessageId: { $max: { $cond: [hasMessageId, 1, 0] } },
          },
        },
        {
          $group: {
            _id: null,
            totalSent: {
              $sum: {
                $cond: [
                  {
                    $or: [
                      { $in: ["$status", ["SENT", "DELIVERED", "READ"]] },
                      { $eq: ["$hasWhatsappMessageId", 1] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            totalDelivered: {
              $sum: {
                $cond: [{ $in: ["$status", ["DELIVERED", "READ"]] }, 1, 0],
              },
            },
            totalRead: {
              $sum: {
                $cond: [{ $eq: ["$status", "READ"] }, 1, 0],
              },
            },
            totalFailed: {
              $sum: {
                $cond: [{ $eq: ["$status", "FAILED"] }, 1, 0],
              },
            },
          },
        },
      ]);
      const totalReceived = await MessageModel.countDocuments({
        userId,
        direction: "INBOUND",
      });

      const mongoStats = {
        totalSent: row?.totalSent ?? 0,
        totalDelivered: row?.totalDelivered ?? 0,
        totalRead: row?.totalRead ?? 0,
        totalFailed: row?.totalFailed ?? 0,
        totalReceived,
      };

      let stats = mongoStats;
      let source: {
        sent: "META" | "MONGODB";
        delivered: "META" | "MONGODB";
        read: "MONGODB";
        failed: "MONGODB";
      } = {
        sent: "MONGODB",
        delivered: "MONGODB",
        read: "MONGODB",
        failed: "MONGODB",
        received: "MONGODB",
      };
      let metaWindow: { start: number; end: number; lookbackDays: number } | null = null;

      try {
        const metaStats = await getMetaMessagingAnalytics(String(req.user!.userId));
        stats = {
          ...mongoStats,
          totalSent: metaStats.sent,
          totalDelivered: metaStats.delivered,
          totalReceived: metaStats.received,
        };
        source = {
          ...source,
          sent: "META",
          delivered: "META",
          received: "META",
        };
        metaWindow = {
          start: metaStats.start,
          end: metaStats.end,
          lookbackDays: metaStats.lookbackDays,
        };
      } catch (err: unknown) {
        // Accounts that have not connected WhatsApp yet still get the local
        // overview. A connected account's Meta API errors are surfaced below
        // instead of silently presenting stale local totals.
        if (
          !(err instanceof Error) ||
          ![
            "WhatsApp is not connected for this account",
            "Stored WhatsApp credentials are missing a WABA ID",
          ].includes(err.message)
        ) {
          throw err;
        }
      }

      res.json({
        stats: {
          ...stats,
        },
        source,
        metaWindow,
      });
    } catch (err: unknown) {
      logger.error({ err }, "GET /messages/stats/summary failed");
      res
        .status(500)
        .json({ error: err instanceof Error ? err.message : "Unknown error" });
    }
  },
);

export default router;
