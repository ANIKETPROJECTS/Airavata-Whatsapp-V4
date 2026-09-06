import { Router } from "express";
import mongoose from "mongoose";
import { ContactModel } from "../models/Contact";
import { GroupModel } from "../models/Group";
import { TagModel } from "../models/Tag";
import { MessageModel } from "../models/Message";
import { CampaignRecipientModel } from "../models/CampaignRecipient";
import { authenticate, type AuthRequest } from "../middlewares/authenticate";
import { logger } from "../lib/logger";

const router = Router();
router.use(authenticate);

const KNOWN_COUNTRY_CODES = [
  "1", "7", "20", "27", "31", "33", "34", "39", "41", "44", "49",
  "52", "55", "60", "61", "64", "65", "81", "82", "86", "90", "91",
  "92", "94", "234", "254", "880", "966", "971", "974", "977",
];
const SORTED_COUNTRY_CODES = [...KNOWN_COUNTRY_CODES].sort((a, b) => b.length - a.length);

function countryCodeFromPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return SORTED_COUNTRY_CODES.find(code => digits.startsWith(code)) ?? "UNKNOWN";
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function getLiveChatStateContactIds(userId: string, chatState: string) {
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const [contactStates, latestRows, unreadRows] = await Promise.all([
    ContactModel.find({ userId }).select("_id chatState").lean(),
    MessageModel.aggregate([
      { $match: { userId: userObjectId } },
      { $group: { _id: "$contactId" } },
    ]),
    MessageModel.aggregate([
      { $match: { userId: userObjectId, direction: "INBOUND" } },
      {
        $lookup: {
          from: "contacts",
          localField: "contactId",
          foreignField: "_id",
          as: "contact",
        },
      },
      { $unwind: "$contact" },
      {
        $match: {
          $expr: {
            $gt: ["$createdAt", { $ifNull: ["$contact.lastReadAt", new Date(0)] }],
          },
        },
      },
      { $group: { _id: "$contactId" } },
    ]),
  ]);

  const latestIds = new Set(latestRows.map(row => String(row._id)));
  const unreadIds = new Set(unreadRows.map(row => String(row._id)));
  const closedIds = new Set(
    contactStates
      .filter(contact => contact.chatState === "CLOSED")
      .map(contact => String(contact._id)),
  );

  return contactStates
    .map(contact => String(contact._id))
    .filter(id => {
      if (chatState === "NEEDS_REPLY" || chatState === "REQ") return unreadIds.has(id);
      if (chatState === "CLOSED") return closedIds.has(id);
      if (chatState === "OPEN" || chatState === "ACTIVE") {
        return latestIds.has(id) && !unreadIds.has(id) && !closedIds.has(id);
      }
      if (chatState === "NO_CHAT" || chatState === "DOR") {
        return !latestIds.has(id) && !closedIds.has(id);
      }
      return true;
    });
}

// ── Helper: build a populated contact response object ─────────────────────────
async function populateContact(doc: InstanceType<typeof ContactModel>) {
  return {
    id: doc._id,
    name: doc.name,
    phone: doc.phone,
    email: doc.email,
    attributes: (doc as unknown as { attributes?: Record<string, unknown> }).attributes ?? {},
    status: doc.status,
    lastContactedAt: doc.lastContactedAt ?? null,
    createdAt: doc.createdAt,
    tags: doc.tags,   // will be populated
    groupId: doc.groupId ?? null,
    groupIds: (doc as unknown as { groupIds?: unknown[] }).groupIds ?? [],
    group: doc.groupId ?? null, // will be populated
  };
}

// GET /api/contacts
router.get("/contacts", async (req: AuthRequest, res) => {
  try {
    const {
      search = "",
      groupId = "",
      tagId = "",
      country = "",
      status = "",
      chatState = "",
      page = "1",
      limit = "50",
    } = req.query as Record<string, string>;
    const filter: Record<string, unknown> = { userId: req.user!.userId };
    const andFilters: Record<string, unknown>[] = [];

    if (search) {
      const safeSearch = escapeRegex(search);
      andFilters.push({ $or: [
        { name: { $regex: safeSearch, $options: "i" } },
        { phone: { $regex: safeSearch, $options: "i" } },
      ] });
    }
    if (groupId) {
      andFilters.push({ $or: [{ groupId }, { groupIds: groupId }] });
    }
    if (tagId) filter["tags"] = tagId;
    if (country) {
      const countryCode = country.replace(/\D/g, "");
      if (country === "UNKNOWN") {
        filter["$expr"] = {
          $not: {
            $regexMatch: {
              input: { $regexReplace: { input: { $ifNull: ["$phone", ""] }, regex: "[^0-9]", replacement: "" } },
              regex: `^(?:${KNOWN_COUNTRY_CODES.join("|")})`,
            },
          },
        };
      } else if (countryCode) {
        filter["$expr"] = {
          $regexMatch: {
            input: { $regexReplace: { input: { $ifNull: ["$phone", ""] }, regex: "[^0-9]", replacement: "" } },
            regex: `^${escapeRegex(countryCode)}`,
          },
        };
      }
    }
    if (andFilters.length > 0) filter["$and"] = andFilters;
    if (status) filter["status"] = status;
    if (chatState) {
      const liveStateIds = await getLiveChatStateContactIds(req.user!.userId, chatState);
      filter["_id"] = { $in: liveStateIds };
    }

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(500, Math.max(1, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [contacts, total] = await Promise.all([
      ContactModel.find(filter)
        .populate("tags", "name color")
        .populate("groupId", "name")
        .populate({ path: "groupIds", select: "name", strictPopulate: false })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      ContactModel.countDocuments(filter),
    ]);
    const contactIds = contacts.map((contact) => contact._id);
    const [latestRows, unreadRows] = await Promise.all([
      MessageModel.aggregate([
        {
          $match: {
            userId: new mongoose.Types.ObjectId(req.user!.userId),
            contactId: { $in: contactIds },
          },
        },
        { $sort: { createdAt: -1 } },
        { $group: { _id: "$contactId", lastMessageAt: { $first: "$createdAt" } } },
      ]),
      MessageModel.aggregate([
        {
          $match: {
            userId: new mongoose.Types.ObjectId(req.user!.userId),
            contactId: { $in: contactIds },
            direction: "INBOUND",
          },
        },
        {
          $lookup: {
            from: "contacts",
            localField: "contactId",
            foreignField: "_id",
            as: "contact",
          },
        },
        { $unwind: "$contact" },
        {
          $match: {
            $expr: {
              $gt: ["$createdAt", { $ifNull: ["$contact.lastReadAt", new Date(0)] }],
            },
          },
        },
        { $group: { _id: "$contactId", unread: { $sum: 1 } } },
      ]),
    ]);
    const campaignRows = contactIds.length > 0
      ? await CampaignRecipientModel.aggregate<{
          _id: mongoose.Types.ObjectId;
          contactId: mongoose.Types.ObjectId;
          status: string;
          enrolledAt?: Date;
          campaign: { _id: mongoose.Types.ObjectId; name: string; status: string };
        }>([
          {
            $match: {
              userId: new mongoose.Types.ObjectId(req.user!.userId),
              contactId: { $in: contactIds },
            },
          },
          {
            $lookup: {
              from: "campaigns",
              let: { campaignId: "$campaignId", ownerId: "$userId" },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ["$_id", "$$campaignId"] },
                        { $eq: ["$userId", "$$ownerId"] },
                      ],
                    },
                  },
                },
                { $project: { _id: 1, name: 1, status: 1 } },
              ],
              as: "campaign",
            },
          },
          { $unwind: "$campaign" },
          {
            $match: {
              $or: [
                { "campaign.status": "SENDING" },
                { status: { $in: ["ACTIVE", "WAITING"] } },
              ],
            },
          },
          { $sort: { enrolledAt: -1, _id: -1 } },
        ])
      : [];
    const latestByContact = new Set(latestRows.map(row => String(row._id)));
    const unreadByContact = new Map(
      unreadRows.map(row => [String(row._id), Number(row.unread ?? 0)]),
    );
    const campaignsByContact = new Map<string, Array<{
      id: string;
      name: string;
      status: string;
      recipientStatus: string;
    }>>();
    for (const row of campaignRows) {
      const key = String(row.contactId);
      const campaigns = campaignsByContact.get(key) ?? [];
      campaigns.push({
        id: String(row.campaign._id),
        name: row.campaign.name,
        status: row.campaign.status,
        recipientStatus: row.status,
      });
      campaignsByContact.set(key, campaigns);
    }

    res.json({
      contacts: contacts.map((c) => ({
        id: c._id,
        name: c.name,
        phone: c.phone,
        email: c.email ?? null,
        attributes: (c as unknown as { attributes?: Record<string, unknown> }).attributes ?? {},
        status: c.status,
        chatState: (c as Record<string, unknown>).chatState ?? "DOR",
        hasConversation: latestByContact.has(String(c._id)),
        unreadMessages: unreadByContact.get(String(c._id)) ?? 0,
        lastContactedAt: c.lastContactedAt ?? null,
        createdAt: c.createdAt,
        tags: c.tags,
        group: c.groupId,
        groups: ((c as unknown as { groupIds?: unknown[] }).groupIds ?? (c.groupId ? [c.groupId] : [])),
        campaigns: campaignsByContact.get(String(c._id)) ?? [],
      })),
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    logger.error({ err: error }, "Contact list failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/contacts/countries — only country codes represented in this workspace
router.get("/contacts/countries", async (req: AuthRequest, res) => {
  try {
    const contacts = await ContactModel.find({ userId: req.user!.userId }).select("phone").lean();
    const counts = new Map<string, number>();
    for (const contact of contacts) {
      const code = countryCodeFromPhone(contact.phone);
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
    res.json({
      countries: [...counts.entries()].map(([code, count]) => ({ code, count })),
    });
  } catch (error) {
    logger.error({ err: error }, "Country filter options failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/contacts
router.post("/contacts", async (req: AuthRequest, res) => {
  try {
    const { name, phone, email, tags, groupId } = req.body as {
      name?: string; phone?: string; email?: string; tags?: string[]; groupId?: string;
    };

    if (!phone?.trim()) {
      res.status(400).json({ error: "phone is required" });
      return;
    }

    // Validate groupId belongs to this user
    if (groupId) {
      const group = await GroupModel.findOne({ _id: groupId, userId: req.user!.userId });
      if (!group) { res.status(400).json({ error: "Invalid group" }); return; }
    }
    const tagIds = [...new Set(tags ?? [])];
    if (tagIds.length > 0) {
      const validTags = await TagModel.find({
        _id: { $in: tagIds },
        userId: req.user!.userId,
      }).select("_id").lean();
      if (validTags.length !== tagIds.length) {
        res.status(400).json({ error: "Invalid tag selection" });
        return;
      }
    }

    const contact = await ContactModel.create({
      userId: req.user!.userId,
      name: name?.trim() || "NA",
      phone: phone.trim(),
      email: email?.trim(),
      tags: tagIds,
      groupId: groupId || undefined,
      groupIds: groupId ? [groupId] : [],
    });

    const populated = await ContactModel.findById(contact._id)
      .populate("tags", "name color")
      .populate("groupId", "name");

    res.status(201).json({
      contact: {
        id: populated!._id,
        name: populated!.name,
        phone: populated!.phone,
        email: populated!.email ?? null,
        status: populated!.status,
        tags: populated!.tags,
        group: populated!.groupId ?? null,
        createdAt: populated!.createdAt,
      },
    });
  } catch (err: unknown) {
    if ((err as { code?: number }).code === 11000) {
      res.status(409).json({ error: "A contact with this phone number already exists" });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

// PUT /api/contacts/:id
router.put("/contacts/:id", async (req: AuthRequest, res) => {
  try {
    const { name, phone, email, attributes, tags, groupId, groupIds, status, chatState } = req.body as {
      name?: string; phone?: string; email?: string; tags?: string[];
      attributes?: Record<string, unknown>;
      groupId?: string | null; groupIds?: string[]; status?: string; chatState?: string;
    };

    const contact = await ContactModel.findOne({ _id: req.params["id"], userId: req.user!.userId });
    if (!contact) { res.status(404).json({ error: "Contact not found" }); return; }

    if (name !== undefined) contact.name = name.trim() || "NA";
    if (phone?.trim()) contact.phone = phone.trim();
    if (email !== undefined) contact.email = email?.trim();
    if (attributes !== undefined) {
      contact.set("attributes", attributes);
      contact.markModified("attributes");
    }
    if (tags !== undefined) {
      const tagIds = [...new Set(tags)];
      const validTags = await TagModel.find({
        _id: { $in: tagIds },
        userId: req.user!.userId,
      }).select("_id").lean();
      if (validTags.length !== tagIds.length) {
        res.status(400).json({ error: "Invalid tag selection" });
        return;
      }
      contact.tags = tagIds as unknown as typeof contact.tags;
    }
    if (groupIds !== undefined) {
      const validGroups = await GroupModel.find({
        _id: { $in: groupIds },
        userId: req.user!.userId,
      }).select('_id');
      if (validGroups.length !== groupIds.length) {
        return res.status(400).json({ error: "Invalid group selection" });
      }
      (contact as unknown as { groupIds: unknown[] }).groupIds = groupIds as unknown[];
      contact.groupId = (groupIds[0] || undefined) as unknown as typeof contact.groupId;
    } else if (groupId !== undefined) {
      if (groupId) {
        const validGroup = await GroupModel.findOne({ _id: groupId, userId: req.user!.userId }).select("_id").lean();
        if (!validGroup) {
          res.status(400).json({ error: "Invalid group selection" });
          return;
        }
      }
      contact.groupId = (groupId || undefined) as unknown as typeof contact.groupId;
      (contact as unknown as { groupIds: unknown[] }).groupIds = groupId ? [groupId] : [];
    }
    if (status) contact.status = status as "active" | "blocked" | "unsubscribed";
    if (chatState) (contact as unknown as Record<string, unknown>).chatState = chatState;

    await contact.save();

    const populated = await ContactModel.findById(contact._id)
      .populate("tags", "name color")
      .populate("groupId", "name")
      .populate({ path: "groupIds", select: "name", strictPopulate: false });

    res.json({
      contact: {
        id: populated!._id,
        name: populated!.name,
        phone: populated!.phone,
        email: populated!.email ?? null,
        attributes: (populated as unknown as { attributes?: Record<string, unknown> }).attributes ?? {},
        status: populated!.status,
        tags: populated!.tags,
        group: populated!.groupId ?? null,
        groups: ((populated as unknown as { groupIds?: unknown[] }).groupIds ?? []),
      },
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/contacts/:id  (single)
router.delete("/contacts/:id", async (req: AuthRequest, res) => {
  try {
    const result = await ContactModel.deleteOne({ _id: req.params["id"], userId: req.user!.userId });
    if (result.deletedCount === 0) { res.status(404).json({ error: "Contact not found" }); return; }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/contacts/bulk-delete
router.post("/contacts/bulk-delete", async (req: AuthRequest, res) => {
  try {
    const { ids } = req.body as { ids?: string[] };
    if (!ids?.length) { res.status(400).json({ error: "ids array required" }); return; }
    const result = await ContactModel.deleteMany({ _id: { $in: ids }, userId: req.user!.userId });
    res.json({ deleted: result.deletedCount });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/contacts/bulk-group  — assign group to multiple contacts
router.post("/contacts/bulk-group", async (req: AuthRequest, res) => {
  try {
    const { ids, groupId } = req.body as { ids?: string[]; groupId?: string };
    if (!ids?.length) { res.status(400).json({ error: "ids array required" }); return; }
    await ContactModel.updateMany(
      { _id: { $in: ids }, userId: req.user!.userId },
      { $set: { groupId: groupId || null } },
    );
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/contacts/bulk-tag  — add tags to multiple contacts
router.post("/contacts/bulk-tag", async (req: AuthRequest, res) => {
  try {
    const { ids, tagIds } = req.body as { ids?: string[]; tagIds?: string[] };
    if (!ids?.length || !tagIds?.length) { res.status(400).json({ error: "ids and tagIds required" }); return; }
    await ContactModel.updateMany(
      { _id: { $in: ids }, userId: req.user!.userId },
      { $addToSet: { tags: { $each: tagIds } } },
    );
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/contacts/import  — CSV import (name, phone, email columns)
router.post("/contacts/import", async (req: AuthRequest, res) => {
  try {
    const { csv } = req.body as { csv?: string };
    if (!csv) { res.status(400).json({ error: "csv field required" }); return; }

    const lines = csv.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) { res.status(400).json({ error: "CSV must have a header and at least one row" }); return; }

    const headers = lines[0]!.toLowerCase().split(",").map(h => h.trim().replace(/"/g, ""));
    const nameIdx = headers.indexOf("name");
    const phoneIdx = headers.indexOf("phone");
    const emailIdx = headers.indexOf("email");

    if (phoneIdx === -1) {
      res.status(400).json({ error: "CSV must have a 'phone' column" });
      return;
    }

    const docs = lines.slice(1).map(line => {
      const cols = line.split(",").map(c => c.trim().replace(/"/g, ""));
      return {
        userId: req.user!.userId,
        name: nameIdx !== -1 ? cols[nameIdx] || "NA" : "NA",
        phone: cols[phoneIdx] ?? "",
        email: emailIdx !== -1 ? cols[emailIdx] : undefined,
      };
    }).filter(d => d.phone);

    const result = await ContactModel.insertMany(docs, { ordered: false }).catch((err) => err);
    const inserted = result.insertedCount ?? result.length ?? docs.length;

    res.json({ imported: inserted, total: docs.length });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/contacts/export  — returns CSV
router.get("/contacts/export", async (req: AuthRequest, res) => {
  try {
    const contacts = await ContactModel.find({ userId: req.user!.userId })
      .populate("tags", "name")
      .populate("groupId", "name")
      .sort({ createdAt: -1 });

    const rows = [
      ["Name", "Phone", "Email", "Tags", "Group", "Status"],
      ...contacts.map(c => [
        c.name,
        c.phone,
        c.email ?? "",
        (c.tags as unknown as { name: string }[]).map(t => t.name).join(";"),
        (c.groupId as unknown as { name: string } | null)?.name ?? "",
        c.status,
      ]),
    ];

    const csv = rows.map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=contacts.csv");
    res.send(csv);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
