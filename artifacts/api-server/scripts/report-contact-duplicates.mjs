import mongoose from "mongoose";

const DEFAULT_COUNTRY_CODE = "91";
const EXAMPLE_LIMIT = 5;

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

function displayName(contact) {
  return {
    id: String(contact._id),
    name: contact.name ?? null,
    phone: contact.phone ?? null,
    normalizedPhone: normalizeContactPhone(contact.phone),
    email: contact.email ?? null,
  };
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

  const report = [];
  let totalGroups = 0;
  let totalDuplicateContacts = 0;
  let skippedInvalidPhones = 0;

  for (const user of users) {
    const tenantDatabaseName = user.tenantDatabaseName;
    if (!tenantDatabaseName) {
      report.push({
        userId: String(user._id),
        businessName: user.businessName,
        tenantDatabaseName: null,
        duplicateGroups: 0,
        duplicateContacts: 0,
        examples: [],
        warning: "Tenant database name is not assigned",
      });
      continue;
    }

    const tenantDb = mongoose.connection.useDb(tenantDatabaseName, { useCache: true });
    const contacts = await tenantDb
      .collection("contacts")
      .find(
        { userId: user._id },
        {
          projection: {
            _id: 1,
            userId: 1,
            name: 1,
            phone: 1,
            email: 1,
          },
        },
      )
      .toArray();

    const byPhone = new Map();
    for (const contact of contacts) {
      const normalizedPhone = normalizeContactPhone(contact.phone);
      if (!normalizedPhone) {
        skippedInvalidPhones += 1;
        continue;
      }
      const group = byPhone.get(normalizedPhone) ?? [];
      group.push(contact);
      byPhone.set(normalizedPhone, group);
    }

    const duplicateGroups = [...byPhone.entries()]
      .filter(([, group]) => group.length > 1)
      .sort(([left], [right]) => left.localeCompare(right));
    const duplicateContacts = duplicateGroups.reduce(
      (sum, [, group]) => sum + group.length,
      0,
    );

    totalGroups += duplicateGroups.length;
    totalDuplicateContacts += duplicateContacts;

    report.push({
      userId: String(user._id),
      businessName: user.businessName,
      email: user.email ?? null,
      tenantDatabaseName,
      contactsScanned: contacts.length,
      duplicateGroups: duplicateGroups.length,
      duplicateContacts,
      examples: duplicateGroups.slice(0, EXAMPLE_LIMIT).map(([normalizedPhone, group]) => ({
        normalizedPhone,
        contacts: group.map(displayName),
      })),
    });
  }

  console.log(
    JSON.stringify(
      {
        readOnly: true,
        tenantsScanned: report.length,
        totalDuplicateGroups: totalGroups,
        totalDuplicateContacts: totalDuplicateContacts,
        skippedInvalidPhones,
        tenants: report,
      },
      null,
      2,
    ),
  );

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  await mongoose.disconnect().catch(() => undefined);
  process.exitCode = 1;
});