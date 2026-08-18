/**
 * Module 8: Campaigns — Create, launch, and report.
 * Sending deducts 1 credit per recipient and stores per-message records.
 */

import { Router } from "express";
import mongoose from "mongoose";
import { CampaignModel } from "../models/Campaign";
import { ContactModel } from "../models/Contact";
import { TemplateModel } from "../models/Template";
import { MessageModel } from "../models/Message";
import { sendTemplateMessage } from "../lib/whatsapp";
import { authenticate, type AuthRequest } from "../middlewares/authenticate";
import { logger } from "../lib/logger";

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function shapeCampaign(
  c: Record<string, unknown> & { _id: unknown; templateId?: unknown },
) {
  return {
    id: String(c._id),
    name: c.name,
    templateId: c.templateId ? String(c.templateId) : null,
    templateName:
      (c as Record<string, unknown> & { template?: Array<{ name: string }> })
        .template?.[0]?.name ?? null,
    audience: c.audience,
    variableValues: c.variableValues,
    scheduledAt: c.scheduledAt,
    status: c.status,
    stats: c.stats,
    creditCost: c.creditCost,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
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

/** Build WhatsApp template components from variableValues and a contact */
function buildComponents(
  variableValues: Record<string, string>,
  contact: { name: string; phone: string },
): Array<{ type: string; parameters: Array<{ type: string; text: string }> }> {
  const indices = Object.keys(variableValues)
    .map(Number)
    .sort((a, b) => a - b);

  if (indices.length === 0) return [];

  const parameters = indices.map((i) => {
    let value = variableValues[String(i)] ?? "";
    // Support field references: {{name}}, {{phone}}
    value = value.replace(/\{\{name\}\}/gi, contact.name);
    value = value.replace(/\{\{phone\}\}/gi, contact.phone);
    return { type: "text", text: value };
  });

  return [{ type: "body", parameters }];
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

    res.json({ campaigns: campaigns.map(shapeCampaign) });
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

    // Per-recipient breakdown (latest 200 messages)
    const messages = await MessageModel.find({
      campaignId: new mongoose.Types.ObjectId(req.params.id),
      userId,
    })
      .populate("contactId", "name phone")
      .limit(200)
      .lean();

    res.json({ campaign: shapeCampaign(campaign), messages });
  } catch (err: unknown) {
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : "Unknown error" });
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
      templateId,
      contactIds = [],
      groupIds = [],
      variableValues = {},
      scheduledAt,
      phoneNumbers = [],
      tagId,
    } = req.body as {
      name: string;
      templateId: string;
      contactIds?: string[];
      groupIds?: string[];
      variableValues?: Record<string, string>;
      scheduledAt?: string;
      phoneNumbers?: string[];
      tagId?: string;
    };

    if (!name || !templateId) {
      return res
        .status(400)
        .json({ error: "name and templateId are required" });
    }

    // Validate template belongs to user and is APPROVED
    const template = await TemplateModel.findOne({
      _id: templateId,
      userId,
    }).lean();
    if (!template) return res.status(404).json({ error: "Template not found" });
    if (String(template.status).toUpperCase() !== "APPROVED") {
      return res
        .status(400)
        .json({ error: "Only APPROVED templates can be used in campaigns" });
    }

    // Resolve contacts by raw phone numbers (Quick / Tags / Flow campaigns)
    let phoneContactIds: string[] = [];
    if (phoneNumbers.length > 0) {
      const byPhone = await ContactModel.find({
        userId,
        phone: { $in: phoneNumbers },
        status: "active",
      })
        .select("_id")
        .lean();
      phoneContactIds = byPhone.map((c) => String(c._id));
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

    const allContactIds = [
      ...new Set([...contactIds, ...phoneContactIds, ...tagContactIds]),
    ];

    const recipients = await resolveRecipients(userId, allContactIds, groupIds);
    if (recipients.length === 0) {
      return res
        .status(400)
        .json({ error: "No active contacts found for the selected audience" });
    }

    // Create campaign record
    const isScheduled = !!scheduledAt && new Date(scheduledAt) > new Date();
    const campaign = await CampaignModel.create(
      [
        {
          userId,
          name,
          templateId: new mongoose.Types.ObjectId(templateId),
          audience: {
            contactIds: contactIds.map((id) => new mongoose.Types.ObjectId(id)),
            groupIds: groupIds.map((id) => new mongoose.Types.ObjectId(id)),
          },
          variableValues,
          scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
          status: isScheduled ? "SCHEDULED" : "SENDING",
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

    await session.commitTransaction();
    session.endSession();

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

    if (isScheduled) return;

    // ── Send messages asynchronously ──────────────────────────────────────────
    let sent = 0;
    let failed = 0;

    for (const contact of recipients) {
      try {
        const components = buildComponents(variableValues, contact);
        const result = await sendTemplateMessage(
          contact.phone,
          template.name,
          template.language ?? "en_US",
          components,
          userId,
        );

        await MessageModel.create({
          userId,
          contactId: contact._id,
          campaignId: camp._id,
          direction: "OUTBOUND",
          body: resolveBody(template.body, variableValues, contact),
          templateId: template._id,
          whatsappMessageId: result.messages?.[0]?.id ?? null,
          status: "SENT",
          sentAt: new Date(),
        });

        await ContactModel.findByIdAndUpdate(contact._id, {
          lastContactedAt: new Date(),
        });
        sent++;
      } catch (err) {
        logger.error(
          { err, contactId: String(contact._id) },
          "Failed to send to contact",
        );
        await MessageModel.create({
          userId,
          contactId: contact._id,
          campaignId: camp._id,
          direction: "OUTBOUND",
          body: resolveBody(template.body, variableValues, contact),
          templateId: template._id,
          status: "FAILED",
          failureReason: err instanceof Error ? err.message : "Unknown error",
        });
        failed++;
      }
    }

    // Finalize campaign stats
    await CampaignModel.findByIdAndUpdate(camp._id, {
      status: "COMPLETED",
      $set: { "stats.sent": sent, "stats.failed": failed },
    });

    logger.info(
      { campaignId: String(camp._id), sent, failed },
      "Campaign completed",
    );
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

      const [stats] = await CampaignModel.aggregate([
        { $match: { userId } },
        {
          $group: {
            _id: null,
            totalSent: { $sum: "$stats.sent" },
            totalDelivered: { $sum: "$stats.delivered" },
            totalRead: { $sum: "$stats.read" },
            totalFailed: { $sum: "$stats.failed" },
            campaignCount: { $sum: 1 },
          },
        },
      ]);

      res.json({
        stats: stats ?? {
          totalSent: 0,
          totalDelivered: 0,
          totalRead: 0,
          totalFailed: 0,
          campaignCount: 0,
        },
      });
    } catch (err: unknown) {
      res
        .status(500)
        .json({ error: err instanceof Error ? err.message : "Unknown error" });
    }
  },
);

export default router;
