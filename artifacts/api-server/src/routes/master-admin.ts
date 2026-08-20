import { Router, type Response } from "express";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { UserModel } from "../models/User";
import { CreditTransactionModel } from "../models/CreditTransaction";
import { CreditSettingModel } from "../models/CreditSetting";
import { WhatsAppCredentialModel } from "../models/WhatsAppCredential";
import { signToken } from "../lib/jwt";
import { authenticate, requireMasterAdmin, type AuthRequest } from "../middlewares/authenticate";

const router = Router();
const MASTER_EMAIL = process.env.MASTER_ADMIN_EMAIL?.toLowerCase().trim();
const MASTER_PASSWORD = process.env.MASTER_ADMIN_PASSWORD;
const DEFAULT_PERMISSIONS = [
  "dashboard", "live-chat", "contacts", "create-campaign", "campaigns-report",
  "add-template", "manage-templates", "flow-builder", "chatbot", "integration",
  "group", "catalogue", "wa-pay", "credits", "manage", "profile",
];

function validId(id: string): mongoose.Types.ObjectId | null {
  return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
}

function publicUser(user: any, connection?: any) {
  return {
    id: String(user._id),
    businessName: user.businessName,
    email: user.email,
    phone: user.phone ?? null,
    timezone: user.timezone ?? "Asia/Kolkata",
    role: user.role ?? "client",
    active: user.active !== false,
    permissions: user.permissions ?? DEFAULT_PERMISSIONS,
    creditBalance: user.creditBalance ?? 0,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    connection: connection
      ? { connected: true, wabaId: connection.wabaId, phoneNumberId: connection.phoneNumberId, updatedAt: connection.updatedAt }
      : { connected: Boolean(user.metaWabaConnected), wabaId: user.metaWabaId ?? null, phoneNumberId: user.metaPhoneNumberId ?? null },
  };
}

router.post("/master-admin/login", async (req, res) => {
  const { email, password } = (req.body ?? {}) as { email?: string; password?: string };
  if (!MASTER_EMAIL || !MASTER_PASSWORD) {
    res.status(503).json({ error: "Master Admin credentials are not configured" });
    return;
  }
  if (!email?.trim() || !password || email.toLowerCase().trim() !== MASTER_EMAIL ||
      !(await bcrypt.compare(password, await bcrypt.hash(MASTER_PASSWORD, 12)))) {
    res.status(401).json({ error: "Invalid Master Admin credentials" });
    return;
  }
  const token = signToken({ userId: "master-admin", email: MASTER_EMAIL, kind: "master" });
  res.json({ token, admin: { email: MASTER_EMAIL, name: "Master Admin" } });
});

router.use("/master-admin", authenticate, requireMasterAdmin);

router.get("/master-admin/me", (_req, res) => {
  res.json({ admin: { email: MASTER_EMAIL ?? "", name: "Master Admin" } });
});

router.get("/master-admin/users", async (_req, res) => {
  try {
    const users = await UserModel.find().sort({ createdAt: -1 }).lean();
    const ids = users.map((user) => user._id);
    const connections = await WhatsAppCredentialModel.find({ userId: { $in: ids } }).lean();
    const byUser = new Map(connections.map((connection) => [String(connection.userId), connection]));
    res.json({ users: users.map((user) => publicUser(user, byUser.get(String(user._id)))) });
  } catch {
    res.status(500).json({ error: "Unable to load users" });
  }
});

router.post("/master-admin/users", async (req, res) => {
  try {
    const { businessName, email, password, phone, role, permissions, active } = req.body as Record<string, any>;
    if (!businessName?.trim() || !email?.trim() || !password || password.length < 8) {
      res.status(400).json({ error: "Business name, email, and a password of at least 8 characters are required" });
      return;
    }
    const normalizedEmail = email.toLowerCase().trim();
    if (await UserModel.exists({ email: normalizedEmail })) {
      res.status(409).json({ error: "An account with this email already exists" });
      return;
    }
    const user = await UserModel.create({
      businessName: businessName.trim(),
      email: normalizedEmail,
      passwordHash: await bcrypt.hash(password, 12),
      phone: phone?.trim(),
      role: role === "admin" ? "admin" : "client",
      permissions: Array.isArray(permissions) ? permissions : DEFAULT_PERMISSIONS,
      active: active !== false,
    });
    res.status(201).json({ user: publicUser(user) });
  } catch {
    res.status(500).json({ error: "Unable to create user" });
  }
});

router.put("/master-admin/users/:id", async (req, res) => {
  try {
    const id = validId(req.params.id);
    if (!id) { res.status(400).json({ error: "Invalid user ID" }); return; }
    const { businessName, email, phone, timezone, role, permissions, active, password } = req.body as Record<string, any>;
    const update: Record<string, any> = {};
    if (typeof businessName === "string" && businessName.trim()) update.businessName = businessName.trim();
    if (typeof email === "string" && email.trim()) update.email = email.toLowerCase().trim();
    if (typeof phone === "string") update.phone = phone.trim();
    if (typeof timezone === "string" && timezone.trim()) update.timezone = timezone.trim();
    if (role === "admin" || role === "client") update.role = role;
    if (Array.isArray(permissions)) update.permissions = permissions;
    if (typeof active === "boolean") update.active = active;
    if (typeof password === "string" && password.length >= 8) update.passwordHash = await bcrypt.hash(password, 12);
    if (!Object.keys(update).length) { res.status(400).json({ error: "No valid changes provided" }); return; }
    const user = await UserModel.findByIdAndUpdate(id, { $set: update }, { new: true, runValidators: true }).lean();
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    const connection = await WhatsAppCredentialModel.findOne({ userId: id }).lean();
    res.json({ user: publicUser(user, connection) });
  } catch (err: any) {
    res.status(err?.code === 11000 ? 409 : 500).json({ error: err?.code === 11000 ? "Email already exists" : "Unable to update user" });
  }
});

router.delete("/master-admin/users/:id", async (req, res) => {
  const id = validId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid user ID" }); return; }
  const user = await UserModel.findByIdAndDelete(id);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  await WhatsAppCredentialModel.deleteOne({ userId: id });
  res.json({ ok: true });
});

router.post("/master-admin/users/:id/credits", async (req, res) => {
  const id = validId(req.params.id);
  const amount = Number(req.body?.amount);
  if (!id || !Number.isInteger(amount) || amount < 1 || amount > 100000) {
    res.status(400).json({ error: "A whole-number credit amount from 1 to 100,000 is required" });
    return;
  }
  const user = await UserModel.findByIdAndUpdate(id, { $inc: { creditBalance: amount } }, { new: true }).lean();
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  await CreditTransactionModel.create({ userId: id, type: "PURCHASE", amount, balanceAfter: user.creditBalance ?? 0, description: req.body?.description || "Master Admin credit top-up" });
  res.json({ balance: user.creditBalance ?? 0 });
});

router.post("/master-admin/users/:id/credits/adjust", async (req, res) => {
  const id = validId(req.params.id);
  const amount = Number(req.body?.amount);
  const direction = req.body?.direction === "deduct" ? "deduct" : "add";
  const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
  if (!id || !Number.isInteger(amount) || amount < 1 || amount > 100000 || !description) {
    res.status(400).json({ error: "A credit amount from 1 to 100,000 and a reason are required" });
    return;
  }

  const query: Record<string, unknown> = { _id: id };
  if (direction === "deduct") query.creditBalance = { $gte: amount };
  const user = await UserModel.findOneAndUpdate(
    query,
    { $inc: { creditBalance: direction === "add" ? amount : -amount } },
    { new: true },
  ).lean();
  if (!user) {
    res.status(direction === "deduct" ? 409 : 404).json({
      error: direction === "deduct" ? "The user does not have enough credits for this deduction" : "User not found",
    });
    return;
  }
  await CreditTransactionModel.create({
    userId: id,
    type: direction === "add" ? "PURCHASE" : "ADJUSTMENT",
    amount,
    balanceAfter: user.creditBalance ?? 0,
    description,
  });
  res.json({ balance: user.creditBalance ?? 0, direction, amount });
});

router.get("/master-admin/credit-transactions", async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 25));
  const filter: Record<string, any> = {};
  if (typeof req.query.userId === "string" && validId(req.query.userId)) filter.userId = validId(req.query.userId);
  if (req.query.type === "PURCHASE" || req.query.type === "DEDUCTION" || req.query.type === "ADJUSTMENT" || req.query.type === "REFUND") {
    filter.type = req.query.type;
  }
  if (typeof req.query.from === "string" || typeof req.query.to === "string") {
    filter.createdAt = {};
    if (typeof req.query.from === "string") filter.createdAt.$gte = new Date(req.query.from);
    if (typeof req.query.to === "string") filter.createdAt.$lte = new Date(req.query.to);
  }
  const [transactions, total] = await Promise.all([
    CreditTransactionModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    CreditTransactionModel.countDocuments(filter),
  ]);
  const userIds = [...new Set(transactions.map((transaction) => String(transaction.userId)))];
  const users = await UserModel.find({ _id: { $in: userIds } }).select("businessName email").lean();
  const byId = new Map(users.map((user) => [String(user._id), user]));
  res.json({
    transactions: transactions.map((transaction) => ({
      id: String(transaction._id),
      userId: String(transaction.userId),
      user: byId.get(String(transaction.userId)) ?? null,
      type: transaction.type,
      amount: transaction.amount,
      balanceAfter: transaction.balanceAfter,
      description: transaction.description ?? "",
      createdAt: transaction.createdAt,
    })),
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
});

router.get("/master-admin/users/:id/report", async (req, res) => {
  const id = validId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid user ID" }); return; }
  const now = new Date();
  const ranges = {
    day: new Date(now.getTime() - 24 * 60 * 60 * 1000),
    week: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
    month: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
  };
  const rows = await CreditTransactionModel.aggregate([
    { $match: { userId: id } },
    { $group: {
      _id: null,
      totalTransactions: { $sum: 1 },
      totalPurchased: { $sum: { $cond: [{ $eq: ["$type", "PURCHASE"] }, "$amount", 0] } },
      totalUsed: { $sum: { $cond: [{ $eq: ["$type", "DEDUCTION"] }, "$amount", 0] } },
      dayUsed: { $sum: { $cond: [{ $and: [{ $eq: ["$type", "DEDUCTION"] }, { $gte: ["$createdAt", ranges.day] }] }, "$amount", 0] } },
      weekUsed: { $sum: { $cond: [{ $and: [{ $eq: ["$type", "DEDUCTION"] }, { $gte: ["$createdAt", ranges.week] }] }, "$amount", 0] } },
      monthUsed: { $sum: { $cond: [{ $and: [{ $eq: ["$type", "DEDUCTION"] }, { $gte: ["$createdAt", ranges.month] }] }, "$amount", 0] } },
    } },
  ]);
  const transactions = await CreditTransactionModel.find({ userId: id })
    .sort({ createdAt: -1 })
    .limit(50)
    .select("type amount balanceAfter description createdAt")
    .lean();
  const user = await UserModel.findById(id)
    .select("businessName email createdAt creditBalance active role metaWabaConnected")
    .lean();
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json({
    user,
    usage: rows[0] ?? { totalTransactions: 0, totalPurchased: 0, totalUsed: 0, dayUsed: 0, weekUsed: 0, monthUsed: 0 },
    transactions: transactions.map((transaction) => ({
      id: String(transaction._id),
      type: transaction.type,
      amount: transaction.amount,
      balanceAfter: transaction.balanceAfter,
      description: transaction.description ?? "",
      createdAt: transaction.createdAt,
    })),
  });
});

router.get("/master-admin/analytics", async (req, res) => {
  const rangeDays = Math.min(365, Math.max(7, Number(req.query.range) || 30));
  const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);
  const [users, activeUsers, connectedUsers, credits, recentTransactions, dailyActivity, typeBreakdown, topUserUsage] = await Promise.all([
    UserModel.countDocuments(),
    UserModel.countDocuments({ active: { $ne: false } }),
    UserModel.countDocuments({ metaWabaConnected: true }),
    CreditTransactionModel.aggregate([
      { $group: {
        _id: null,
        purchased: { $sum: { $cond: [{ $eq: ["$type", "PURCHASE"] }, "$amount", 0] } },
        used: { $sum: { $cond: [{ $eq: ["$type", "DEDUCTION"] }, "$amount", 0] } },
        transactions: { $sum: 1 },
      } },
    ]),
    CreditTransactionModel.find().sort({ createdAt: -1 }).limit(8).select("userId type amount balanceAfter description createdAt").lean(),
    CreditTransactionModel.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        purchased: { $sum: { $cond: [{ $eq: ["$type", "PURCHASE"] }, "$amount", 0] } },
        used: { $sum: { $cond: [{ $eq: ["$type", "DEDUCTION"] }, "$amount", 0] } },
        adjustments: { $sum: { $cond: [{ $eq: ["$type", "ADJUSTMENT"] }, "$amount", 0] } },
        transactions: { $sum: 1 },
      } },
      { $sort: { _id: 1 } },
    ]),
    CreditTransactionModel.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: "$type", amount: { $sum: "$amount" }, transactions: { $sum: 1 } } },
      { $sort: { amount: -1 } },
    ]),
    CreditTransactionModel.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: "$userId", used: { $sum: { $cond: [{ $eq: ["$type", "DEDUCTION"] }, "$amount", 0] } }, purchased: { $sum: { $cond: [{ $eq: ["$type", "PURCHASE"] }, "$amount", 0] } }, transactions: { $sum: 1 } } },
      { $sort: { used: -1, transactions: -1 } },
      { $limit: 10 },
    ]),
  ]);
  const recentUserIds = [...new Set(recentTransactions.map((transaction) => String(transaction.userId)))];
  const recentUsers = await UserModel.find({ _id: { $in: recentUserIds } }).select("businessName").lean();
  const recentById = new Map(recentUsers.map((user) => [String(user._id), user.businessName]));
  const topUserIds = topUserUsage.map((item) => item._id);
  const topUsers = await UserModel.find({ _id: { $in: topUserIds } }).select("businessName email").lean();
  const topById = new Map(topUsers.map((user) => [String(user._id), user]));
  res.json({
    users,
    activeUsers,
    inactiveUsers: users - activeUsers,
    connectedUsers,
    unconnectedUsers: users - connectedUsers,
    rangeDays,
    credits: credits[0] ?? { purchased: 0, used: 0, transactions: 0 },
    dailyActivity: dailyActivity.map((item) => ({ date: item._id, purchased: item.purchased, used: item.used, adjustments: item.adjustments, transactions: item.transactions })),
    typeBreakdown: typeBreakdown.map((item) => ({ type: item._id, amount: item.amount, transactions: item.transactions })),
    topUsers: topUserUsage.map((item) => ({ user: topById.get(String(item._id))?.businessName ?? "Unknown user", email: topById.get(String(item._id))?.email ?? "", used: item.used, purchased: item.purchased, transactions: item.transactions })),
    recentTransactions: recentTransactions.map((transaction) => ({
      id: String(transaction._id),
      user: recentById.get(String(transaction.userId)) ?? "Unknown user",
      type: transaction.type,
      amount: transaction.amount,
      balanceAfter: transaction.balanceAfter,
      description: transaction.description ?? "",
      createdAt: transaction.createdAt,
    })),
  });
});

router.get("/master-admin/credit-setting", async (_req, res) => {
  const setting = await CreditSettingModel.findOne({ key: "messageRates" })
    .select("authenticationRate utilityRate marketingRate updatedAt")
    .lean();
  res.json({
    authenticationRate: setting?.authenticationRate ?? 1,
    utilityRate: setting?.utilityRate ?? 1,
    marketingRate: setting?.marketingRate ?? 1,
    updatedAt: setting?.updatedAt,
  });
});

router.put("/master-admin/credit-setting", async (req, res) => {
  const { authenticationRate, utilityRate, marketingRate } = req.body as Record<string, unknown>;
  const rates = { authenticationRate, utilityRate, marketingRate };
  if (Object.values(rates).some((value) => !Number.isInteger(value) || Number(value) < 1 || Number(value) > 1000)) {
    res.status(400).json({ error: "All message rates must be whole numbers from 1 to 1,000" });
    return;
  }
  const setting = await CreditSettingModel.findOneAndUpdate(
    { key: "messageRates" },
    { $set: rates },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
  res.json({
    authenticationRate: setting!.authenticationRate,
    utilityRate: setting!.utilityRate,
    marketingRate: setting!.marketingRate,
    updatedAt: setting!.updatedAt,
  });
});

router.post("/master-admin/users/:id/disconnect", async (req, res) => {
  const id = validId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid user ID" }); return; }
  await WhatsAppCredentialModel.deleteOne({ userId: id });
  await UserModel.findByIdAndUpdate(id, { $set: { metaWabaConnected: false }, $unset: { metaWabaId: 1, metaPhoneNumberId: 1, metaWabaAccessToken: 1 } });
  res.json({ ok: true });
});

export default router;