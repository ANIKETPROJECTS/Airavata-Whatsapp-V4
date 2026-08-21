import mongoose, {
  type Connection,
  type Model,
  type Schema,
} from "mongoose";
import { AsyncLocalStorage } from "node:async_hooks";

type TenantContext = {
  userId: string;
  connection: Connection;
};

const tenantStorage = new AsyncLocalStorage<TenantContext>();
const connectionCache = new Map<string, Connection>();
const tenantSchemas = new Map<string, Schema>();
// MongoDB rejects ":" in database namespaces, so use the safe equivalent
// "User_<businessName>_<phone>" while keeping the requested User + name convention.
const TENANT_DATABASE_PREFIX = "User_";

function registerTenantModels(connection: Connection) {
  for (const [name, schema] of tenantSchemas) {
    if (!connection.models[name]) {
      connection.model(name, schema);
    }
  }
}

function normalizeUserId(userId: string) {
  if (!mongoose.isValidObjectId(userId)) {
    throw new Error("Invalid tenant user ID");
  }
  return String(new mongoose.Types.ObjectId(userId));
}

export function businessNameDatabaseBase(businessName: string) {
  const normalized = businessName
    .trim()
    .replace(/[\/\\."$]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_-]+|[_-]+$/g, "");
  if (!normalized) {
    throw new Error("Business name cannot produce a valid tenant database name");
  }
  return normalized.slice(0,  fiftyChars);
}

export function phoneDatabaseBase(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) {
    throw new Error("Phone number cannot produce a valid tenant database name");
  }
  return digits.slice(0, 30);
}

const fiftyChars = 50;

export async function getTenantDatabaseName(userId: string) {
  const normalized = normalizeUserId(userId);
  const db = mongoose.connection.db;
  if (!db) throw new Error("MongoDB is not connected");
  const users = db.collection("users");
  const user = await users.findOne(
    { _id: new mongoose.Types.ObjectId(normalized) },
    { projection: { businessName: 1, phone: 1, tenantDatabaseName: 1 } },
  );
  if (!user?.businessName) throw new Error("Tenant user was not found");
  // Tenant names are immutable after first assignment. This keeps existing
  // workspaces stable when a user edits their business name or phone number.
  if (
    typeof user.tenantDatabaseName === "string" &&
    user.tenantDatabaseName.startsWith(TENANT_DATABASE_PREFIX)
  ) {
    return user.tenantDatabaseName;
  }

  const base = businessNameDatabaseBase(user.businessName);
  const phone = typeof user.phone === "string" ? phoneDatabaseBase(user.phone) : "";
  const businessDatabaseName = `${TENANT_DATABASE_PREFIX}${base}${phone ? `_${phone}` : ""}`;
  const duplicate = await users.findOne({
    tenantDatabaseName: businessDatabaseName,
    _id: { $ne: new mongoose.Types.ObjectId(normalized) },
  });
  const conflictsWithControlPlane =
    businessDatabaseName.toLowerCase() === mongoose.connection.name.toLowerCase();
  const databaseName = duplicate || conflictsWithControlPlane
    ? `${businessDatabaseName}_${normalized.slice(-8)}`
    : businessDatabaseName;

  await users.updateOne(
    { _id: new mongoose.Types.ObjectId(normalized) },
    { $set: { tenantDatabaseName: databaseName } },
  );
  return databaseName;
}

export function getTenantContext() {
  const context = tenantStorage.getStore();
  if (!context) {
    throw new Error("Tenant database context is required");
  }
  return context;
}

export function getTenantConnection() {
  const connection = getTenantContext().connection;
  registerTenantModels(connection);
  return connection;
}

export async function runWithTenant<T>(
  userId: string,
  callback: () => Promise<T> | T,
): Promise<T> {
  const normalized = normalizeUserId(userId);
  const databaseName = await getTenantDatabaseName(normalized);
  let connection = connectionCache.get(databaseName);

  if (!connection) {
    connection = mongoose.connection.useDb(databaseName, { useCache: true });
    connectionCache.set(databaseName, connection);
  }

  return tenantStorage.run(
    { userId: normalized, connection },
    async () => callback(),
  );
}

export function tenantModel<T>(
  name: string,
  schema: Schema<T>,
): Model<T> {
  tenantSchemas.set(name, schema);
  const proxy = new Proxy({} as Model<T>, {
    get(_target, property, receiver) {
      const connection = getTenantConnection();
      const model = connection.models[name] ?? connection.model(name, schema);
      const value = Reflect.get(model, property, receiver);
      return typeof value === "function" ? value.bind(model) : value;
    },
  });

  return proxy;
}

export async function ensureTenantDatabase(userId: string) {
  return runWithTenant(userId, async () => {
    const connection = getTenantConnection();
    await connection.createCollection("__tenant_initialized").catch((error: unknown) => {
      if ((error as { code?: number }).code !== 48) throw error;
    });
    return connection.name;
  });
}

export function clearTenantConnectionCache() {
  connectionCache.clear();
}