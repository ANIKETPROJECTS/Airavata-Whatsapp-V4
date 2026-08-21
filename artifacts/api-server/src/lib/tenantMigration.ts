import mongoose from "mongoose";
import {
  clearTenantConnectionCache,
  databaseNameForUserProfile,
  ensureTenantDatabase,
  getTenantDatabaseName,
} from "./tenantDatabase";
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
  "notifications",
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
  const databaseName = await getTenantDatabaseName(userId);
  await ensureTenantDatabase(userId);
  const source = controlPlaneDb();
  const migrationState = source.collection("tenantmigrations");
  const existingState = await migrationState.findOne({ userId: id, verified: true });
  if (existingState) {
    if (existingState.databaseName === databaseName) {
      return {
        userId,
        databaseName,
        verified: true,
        skipped: true,
        collections: [],
      };
    }
  }
  const target = mongoose.connection.useDb(databaseName, { useCache: true }).db;
  if (!target) throw new Error("Tenant database is not connected");

  const collections = [];
  for (const collectionName of TENANT_COLLECTIONS) {
    collections.push(await copyCollection(source, target, collectionName, id));
  }

  const verified = collections.every((item) => item.sourceCount === item.targetCount);
  if (verified) {
    await migrationState.updateOne(
      { userId: id },
      { $set: { userId: id, databaseName, verified: true, migratedAt: new Date() } },
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

export async function renameTenantDatabase(
  userId: string,
  businessName: string,
  phone?: string,
) {
  const currentDatabaseName = await getTenantDatabaseName(userId);
  const nextDatabaseName = await databaseNameForUserProfile(
    userId,
    businessName,
    phone,
  );

  if (currentDatabaseName === nextDatabaseName) {
    return { renamed: false, from: currentDatabaseName, to: nextDatabaseName };
  }

  const source = mongoose.connection.useDb(currentDatabaseName, { useCache: true }).db;
  const target = mongoose.connection.useDb(nextDatabaseName, { useCache: true }).db;
  if (!source || !target) throw new Error("Tenant database is not connected");

  const collections = [];
  for (const collectionName of TENANT_COLLECTIONS) {
    const documents = await source.collection(collectionName).find({}).toArray();
    if (documents.length > 0) {
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
    }
    const targetCount = await target.collection(collectionName).countDocuments({});
    collections.push({
      collectionName,
      sourceCount: documents.length,
      targetCount,
    });
  }

  const verified = collections.every(
    (collection) => collection.sourceCount === collection.targetCount,
  );
  if (!verified) {
    throw new Error("Tenant database rename verification failed");
  }

  await UserModel.updateOne(
    { _id: new mongoose.Types.ObjectId(userId) },
    { $set: { tenantDatabaseName: nextDatabaseName } },
  );
  await source.dropDatabase();
  clearTenantConnectionCache();

  return {
    renamed: true,
    from: currentDatabaseName,
    to: nextDatabaseName,
    collections,
  };
}

export async function deleteTenantDatabase(userId: string) {
  const databaseName = await getTenantDatabaseName(userId);
  if (databaseName === mongoose.connection.name) {
    throw new Error("Refusing to delete the control-plane database");
  }
  const connection = mongoose.connection.useDb(databaseName, { useCache: true });
  await connection.dropDatabase();
  return databaseName;
}