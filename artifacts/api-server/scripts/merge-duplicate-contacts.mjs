import mongoose from "mongoose";

const DEFAULT_COUNTRY_CODE = "91";
const STATUS_RANK = {
  READ: 6,
  DELIVERED: 5,
  SENT: 4,
  RECEIVED: 4,
  COMPLETED: 4,
  ACTIVE: 3,
  WAITING: 3,
  FAILED: 2,
  QUEUED: 1,
  RESERVED: 1,
  SENDING: 1,
  SKIPPED: 0,
  OPTED_OUT: 0,
};

function normalizeContactPhone(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (raw.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 10) digits = `${DEFAULT_COUNTRY_CODE}${digits}`;
  else if (digits.length === 11 && digits.startsWith("0")) {
    digits = `${DEFAULT_COUNTRY_CODE}${digits.slice(1)}`;
  }
  return /^\d{7,15}$/.test(digits) ? `+${digits}` : null;
}

function isMeaningfulName(name, phones) {
  const value = String(name ?? "").trim();
  if (!value || /^(na|n\/a|unnamed contact)$/i.test(value)) return false;
  if (/^[A-Z0-9]{2,5}$/.test(value)) return false;
  return !phones.some((phone) => value === phone || value === phone.slice(1));
}

function objectSize(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? Object.keys(value).length
    : 0;
}

function nonEmpty(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function activityTime(contact) {
  return Math.max(
    new Date(contact.lastContactedAt ?? 0).getTime(),
    new Date(contact.updatedAt ?? 0).getTime(),
    new Date(contact.lastReadAt ?? 0).getTime(),
  );
}

function chooseSurvivor(contacts, messageCounts) {
  const scored = contacts.map((contact) => {
    const phone = normalizeContactPhone(contact.phone);
    const phones = [phone, contact.phone].filter(Boolean);
    const meaningfulName = isMeaningfulName(contact.name, phones);
    const score =
      (meaningfulName ? 100 + String(contact.name).trim().length : 0) +
      (nonEmpty(contact.email) ? 20 : 0) +
      objectSize(contact.attributes) * 5 +
      (contact.tags?.length ?? 0) * 3 +
      (contact.groupIds?.length ?? 0) * 2 +
      (contact.groupId ? 2 : 0) +
      (contact.chatbotSession ? 2 : 0) +
      (messageCounts.get(String(contact._id)) ?? 0);
    return { contact, score };
  });

  scored.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return new Date(left.contact.createdAt ?? 0) - new Date(right.contact.createdAt ?? 0);
  });
  return scored[0].contact;
}

function mergeAttributes(contacts) {
  const merged = {};
  for (const contact of contacts) {
    if (!contact.attributes || typeof contact.attributes !== "object") continue;
    for (const [key, value] of Object.entries(contact.attributes)) {
      if (!nonEmpty(merged[key]) && nonEmpty(value)) merged[key] = value;
    }
  }
  return merged;
}

function mergeDate(contacts, field) {
  const dates = contacts
    .map((contact) => contact[field])
    .filter(Boolean)
    .map((value) => new Date(value))
    .filter((value) => !Number.isNaN(value.getTime()));
  return dates.length ? new Date(Math.max(...dates.map((date) => date.getTime()))) : undefined;
}

function mergeStatus(contacts) {
  if (contacts.some((contact) => contact.status === "unsubscribed")) return "unsubscribed";
  if (contacts.some((contact) => contact.status === "blocked")) return "blocked";
  return "active";
}

function mergeChatState(contacts) {
  return [...contacts]
    .sort((left, right) => activityTime(right) - activityTime(left))
    .find((contact) => nonEmpty(contact.chatState))?.chatState ?? "DOR";
}

function mergedContactUpdate(contacts, normalizedPhone) {
  const meaningful = contacts.find((contact) =>
    isMeaningfulName(contact.name, [normalizedPhone, contact.phone]),
  );
  const email = contacts.find((contact) => nonEmpty(contact.email))?.email;
  const groupIds = [
    ...new Set(
      contacts.flatMap((contact) => [
        ...(Array.isArray(contact.groupIds) ? contact.groupIds.map(String) : []),
        ...(contact.groupId ? [String(contact.groupId)] : []),
      ]),
    ),
  ].map((value) => new mongoose.Types.ObjectId(value));
  const tags = [
    ...new Set(contacts.flatMap((contact) => (contact.tags ?? []).map(String))),
  ].map((value) => new mongoose.Types.ObjectId(value));

  return {
    phone: normalizedPhone,
    ...(meaningful ? { name: meaningful.name } : {}),
    ...(email ? { email } : {}),
    attributes: mergeAttributes(contacts),
    tags,
    groupIds,
    ...(groupIds[0] ? { groupId: groupIds[0] } : { groupId: null }),
    status: mergeStatus(contacts),
    chatState: mergeChatState(contacts),
    ...(mergeDate(contacts, "lastContactedAt")
      ? { lastContactedAt: mergeDate(contacts, "lastContactedAt") }
      : {}),
    ...(mergeDate(contacts, "lastReadAt")
      ? { lastReadAt: mergeDate(contacts, "lastReadAt") }
      : {}),
  };
}

function chooseStrongest(rows) {
  return [...rows].sort((left, right) => {
    const statusDifference =
      (STATUS_RANK[right.status] ?? 0) - (STATUS_RANK[left.status] ?? 0);
    if (statusDifference) return statusDifference;
    return new Date(left.updatedAt ?? left.createdAt ?? 0) -
      new Date(right.updatedAt ?? right.createdAt ?? 0);
  })[0];
}

async function mergeCampaignReferences(db, userId, survivorId, duplicateIds, session) {
  const allContactIds = [survivorId, ...duplicateIds];
  const recipientsCollection = db.collection("campaignrecipients");
  const sendsCollection = db.collection("campaignsends");
  const campaignsCollection = db.collection("campaigns");

  const recipients = await recipientsCollection
    .find({ userId, contactId: { $in: allContactIds } }, { session })
    .toArray();
  const recipientsByCampaign = new Map();
  for (const recipient of recipients) {
    const key = String(recipient.campaignId);
    const group = recipientsByCampaign.get(key) ?? [];
    group.push(recipient);
    recipientsByCampaign.set(key, group);
  }

  let recipientDeleted = 0;
  let sendDeleted = 0;
  for (const group of recipientsByCampaign.values()) {
    const target =
      group.find((recipient) => String(recipient.contactId) === String(survivorId)) ??
      chooseStrongest(group);
    const oldRecipientIds = group
      .filter((recipient) => String(recipient._id) !== String(target._id))
      .map((recipient) => recipient._id);

    const sends = await sendsCollection
      .find({ userId, recipientId: { $in: group.map((recipient) => recipient._id) } }, { session })
      .toArray();
    const sendsByStep = new Map();
    for (const send of sends) {
      const key = `${String(send.campaignId)}:${send.stepId}`;
      const stepSends = sendsByStep.get(key) ?? [];
      stepSends.push(send);
      sendsByStep.set(key, stepSends);
    }

    for (const stepSends of sendsByStep.values()) {
      const strongest = chooseStrongest(stepSends);
      const sendIdsToDelete = stepSends
        .filter((send) => String(send._id) !== String(strongest._id))
        .map((send) => send._id);
      if (sendIdsToDelete.length) {
        await sendsCollection.deleteMany({ _id: { $in: sendIdsToDelete } }, { session });
        sendDeleted += sendIdsToDelete.length;
      }
      await sendsCollection.updateOne(
        { _id: strongest._id },
        { $set: { recipientId: target._id, contactId: survivorId } },
        { session },
      );
    }

    await recipientsCollection.updateOne(
      { _id: target._id },
      { $set: { contactId: survivorId } },
      { session },
    );
    if (oldRecipientIds.length) {
      await recipientsCollection.deleteMany({ _id: { $in: oldRecipientIds } }, { session });
      recipientDeleted += oldRecipientIds.length;
    }
  }

  const campaigns = await campaignsCollection
    .find({ userId, "audience.contactIds": { $in: duplicateIds } }, { session })
    .toArray();
  for (const campaign of campaigns) {
    const contactIds = campaign.audience?.contactIds;
    if (!Array.isArray(contactIds)) continue;
    const deduped = [
      ...new Map(
        contactIds.map((contactId) => [
          String(contactId),
          duplicateIds.some((id) => String(id) === String(contactId))
            ? survivorId
            : contactId,
        ]),
      ).values(),
    ];
    await campaignsCollection.updateOne(
      { _id: campaign._id },
      { $set: { "audience.contactIds": deduped } },
      { session },
    );
  }

  return { recipientDeleted, sendDeleted };
}

async function mergeTenant(db, userId) {
  const contactsCollection = db.collection("contacts");
  const messagesCollection = db.collection("messages");
  const contacts = await contactsCollection
    .find({ userId })
    .toArray();
  const byPhone = new Map();
  for (const contact of contacts) {
    const normalizedPhone = normalizeContactPhone(contact.phone);
    if (!normalizedPhone) continue;
    const group = byPhone.get(normalizedPhone) ?? [];
    group.push(contact);
    byPhone.set(normalizedPhone, group);
  }

  const duplicateGroups = [...byPhone.entries()].filter(([, group]) => group.length > 1);
  const result = {
    duplicateGroups: duplicateGroups.length,
    contactsMerged: 0,
    contactsDeleted: 0,
    messagesReassigned: 0,
    recipientRecordsDeleted: 0,
    sendRecordsDeleted: 0,
    groups: [],
  };

  if (!duplicateGroups.length) return result;

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      for (const [normalizedPhone, group] of duplicateGroups) {
        const ids = group.map((contact) => contact._id);
        const messageCounts = new Map();
        for (const row of await messagesCollection.aggregate(
          [
            { $match: { userId, contactId: { $in: ids } } },
            { $group: { _id: "$contactId", count: { $sum: 1 } } },
          ],
          { session },
        ).toArray()) {
          messageCounts.set(String(row._id), row.count);
        }

        const survivor = chooseSurvivor(group, messageCounts);
        const duplicateIds = ids.filter((id) => String(id) !== String(survivor._id));
        const mergedContacts = [survivor, ...group.filter((contact) => String(contact._id) !== String(survivor._id))];
        const messageCountsBefore = Object.fromEntries(
          group.map((contact) => [
            String(contact._id),
            messageCounts.get(String(contact._id)) ?? 0,
          ]),
        );
        const messageCountBefore = Object.values(messageCountsBefore).reduce(
          (sum, count) => sum + count,
          0,
        );

        const messageUpdate = await messagesCollection.updateMany(
          { userId, contactId: { $in: duplicateIds } },
          { $set: { contactId: survivor._id } },
          { session },
        );
        const referenceResult = await mergeCampaignReferences(
          db,
          userId,
          survivor._id,
          duplicateIds,
          session,
        );

        await contactsCollection.updateOne(
          { _id: survivor._id, userId },
          { $set: mergedContactUpdate(mergedContacts, normalizedPhone) },
          { session },
        );
        await contactsCollection.deleteMany(
          { userId, _id: { $in: duplicateIds } },
          { session },
        );
        const messageCountAfter = await messagesCollection.countDocuments(
          { userId, contactId: survivor._id },
          { session },
        );

        result.contactsMerged += duplicateIds.length;
        result.contactsDeleted += duplicateIds.length;
        result.messagesReassigned += messageUpdate.modifiedCount;
        result.recipientRecordsDeleted += referenceResult.recipientDeleted;
        result.sendRecordsDeleted += referenceResult.sendDeleted;
        result.groups.push({
          normalizedPhone,
          kept: {
            id: String(survivor._id),
            name: survivor.name ?? null,
            phone: survivor.phone,
          },
          deleted: group
            .filter((contact) => String(contact._id) !== String(survivor._id))
            .map((contact) => ({
              id: String(contact._id),
              name: contact.name ?? null,
              phone: contact.phone,
            })),
          messageCountsBefore,
          messageCountBefore,
          messageCountAfter,
          messagesPreserved: messageCountBefore === messageCountAfter,
        });
      }
    });
  } finally {
    await session.endSession();
  }

  return result;
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is required");

  await mongoose.connect(uri);
  const controlDb = mongoose.connection.db;
  if (!controlDb) throw new Error("MongoDB control-plane database is unavailable");

  const users = await controlDb
    .collection("users")
    .find(
      { businessName: { $exists: true, $ne: null } },
      { projection: { _id: 1, email: 1, businessName: 1, tenantDatabaseName: 1 } },
    )
    .sort({ _id: 1 })
    .toArray();

  const tenants = [];
  for (const user of users) {
    if (!user.tenantDatabaseName) {
      tenants.push({
        userId: String(user._id),
        businessName: user.businessName,
        duplicateGroups: 0,
        contactsMerged: 0,
        contactsDeleted: 0,
        warning: "Tenant database name is not assigned",
      });
      continue;
    }

    const db = mongoose.connection.useDb(user.tenantDatabaseName, { useCache: true });
    const result = await mergeTenant(db, user._id);
    tenants.push({
      userId: String(user._id),
      businessName: user.businessName,
      tenantDatabaseName: user.tenantDatabaseName,
      ...result,
    });
  }

  console.log(JSON.stringify({ tenants, readOnly: false }, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  await mongoose.disconnect().catch(() => undefined);
  process.exitCode = 1;
});