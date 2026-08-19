import { Router } from "express";
import { ContactModel } from "../models/Contact";
import { GroupModel } from "../models/Group";
import { TagModel } from "../models/Tag";
import { authenticate, type AuthRequest } from "../middlewares/authenticate";

const router = Router();
router.use(authenticate);

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
    const { search = "", groupId = "", page = "1", limit = "50" } = req.query as Record<string, string>;
    const filter: Record<string, unknown> = { userId: req.user!.userId };

    if (search) {
      filter["$or"] = [
        { name: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ];
    }
    if (groupId) filter["groupId"] = groupId;

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(100, Math.max(1, Number(limit)));
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

    res.json({
      contacts: contacts.map((c) => ({
        id: c._id,
        name: c.name,
        phone: c.phone,
        email: c.email ?? null,
        attributes: (c as unknown as { attributes?: Record<string, unknown> }).attributes ?? {},
        status: c.status,
        chatState: (c as Record<string, unknown>).chatState ?? "DOR",
        lastContactedAt: c.lastContactedAt ?? null,
        createdAt: c.createdAt,
        tags: c.tags,
        group: c.groupId,
        groups: ((c as unknown as { groupIds?: unknown[] }).groupIds ?? (c.groupId ? [c.groupId] : [])),
      })),
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/contacts
router.post("/contacts", async (req: AuthRequest, res) => {
  try {
    const { name, phone, email, tags, groupId } = req.body as {
      name?: string; phone?: string; email?: string; tags?: string[]; groupId?: string;
    };

    if (!name?.trim() || !phone?.trim()) {
      res.status(400).json({ error: "name and phone are required" });
      return;
    }

    // Validate groupId belongs to this user
    if (groupId) {
      const group = await GroupModel.findOne({ _id: groupId, userId: req.user!.userId });
      if (!group) { res.status(400).json({ error: "Invalid group" }); return; }
    }

    const contact = await ContactModel.create({
      userId: req.user!.userId,
      name: name.trim(),
      phone: phone.trim(),
      email: email?.trim(),
      tags: tags ?? [],
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

    if (name?.trim()) contact.name = name.trim();
    if (phone?.trim()) contact.phone = phone.trim();
    if (email !== undefined) contact.email = email?.trim();
    if (attributes !== undefined) {
      contact.set("attributes", attributes);
    }
    if (tags !== undefined) contact.tags = tags as unknown as typeof contact.tags;
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

    if (nameIdx === -1 || phoneIdx === -1) {
      res.status(400).json({ error: "CSV must have 'name' and 'phone' columns" });
      return;
    }

    const docs = lines.slice(1).map(line => {
      const cols = line.split(",").map(c => c.trim().replace(/"/g, ""));
      return {
        userId: req.user!.userId,
        name: cols[nameIdx] ?? "",
        phone: cols[phoneIdx] ?? "",
        email: emailIdx !== -1 ? cols[emailIdx] : undefined,
      };
    }).filter(d => d.name && d.phone);

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
