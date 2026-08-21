import mongoose from "mongoose";
import { ensureTenantDatabase, tenantDatabaseName } from "./tenantDatabase";
import { UserModel } from "../models/User";

const TENANT_COLLECTIONS = [
  "agents",
  "apikeys",
  "attributes",
  "audiencesegments",
  "campaigns",
  "campaignrecipients",
  "campaignsends",
  "cannedmessages",
  "chatbotflows",
  "contacts",
  "flows",
  "groups",
  "livechatsettings",
  "messages",
  "servicepricingcatalogs",
  "tags",
  "templates",
  "whatsappcredentials",
] as const;

type CollectionName = (typeof TENANT_COLLECTIONS)[number];

function controlPlaneDb() {
  const db = mongoose.connection.db;
  if (!db) throw new Error("MongoDB is not connected");
  return db;
}

async function copyCollection(
  source: ReturnType<typeof controlPlaneDb>,
  target: ReturnType<typeof controlPlaneDb>,
  collectionName: CollectionName,
  userId: mongoose.Types.ObjectId,
) {
  const documents = await source
    .collection(collectionName)
    .find({ userId })
    .toArray();

  if (documents.length === 0) {
    return { collectionName, sourceCount: 0, targetCount: 0 };
  }

  await target.collection(collectionName).bulkWrite(
    documents.map((document) => ({
      replaceOne: {
        filter: { _id: document._id },
        replacement: document,
        upsert: true,
      },
    })),
    { ordered: false },
  );

  const targetCount = await target.collection(collectionName).countDocuments({ userId });
  return { collectionName, sourceCount: documents.length, targetCount };
}

export async function migrateExistingUser(userId: string) {
  const id = new mongoose.Types.ObjectId(userId);
  await ensureTenantDatabase(userId);
  const source = controlPlaneDb();
  const migrationState = source.collection("tenantmigrations");
  const existingState = await migrationState.findOne({ userId: id, verified: true });
  if (existingState) {
    return {
      userId,
      databaseName: tenantDatabaseName(userId),
      verified: true,
      skipped: true,
      collections: [],
    };
  }
  const target = mongoose.connection.useDb(tenantDatabaseName(userId), { useCache: true }).db;
  if (!target) throw new Error("Tenant database is not connected");

  const collections = [];
  for (const collectionName of TENANT_COLLECTIONS) {
    collections.push(await copyCollection(source, target, collectionName, id));
  }

  const verified = collections.every((item) => item.sourceCount === item.targetCount);
  if (verified) {
    await migrationState.updateOne(
      { userId: id },
      { $set: { userId: id, verified: true, migratedAt: new Date() } },
      { upsert: true },
    );
  }
  return { userId, databaseName: target.databaseName, verified, collections };
}

export async function migrateAllExistingUsers() {
  const users = await UserModel.find({ role: { $in: ["admin", "client"] } })
    .select("_id businessName")
    .lean();
  const results = [];
  for (const user of users) {
    results.push(await migrateExistingUser(String(user._id)));
  }
  return {
    totalUsers: users.length,
    verifiedUsers: results.filter((result) => result.verified).length,
    results,
  };
}

export async function deleteTenantDatabase(userId: string) {
  const databaseName = tenantDatabaseName(userId);
  if (databaseName === mongoose.connection.name) {
    throw new Error("Refusing to delete the control-plane database");
  }
  const connection = mongoose.connection.useDb(databaseName, { useCache: true });
  await connection.dropDatabase();
  return databaseName;
}