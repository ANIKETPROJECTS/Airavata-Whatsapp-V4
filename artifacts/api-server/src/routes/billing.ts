/**
 * Module 9: Credits & Billing
 * Exposes credit balance, transaction history, and manual top-up.
 * A real payment gateway (Razorpay/Stripe) will replace the manual top-up endpoint.
 */

import { Router } from "express";
import mongoose from "mongoose";
import { UserModel } from "../models/User";
import { CreditTransactionModel } from "../models/CreditTransaction";
import { authenticate, type AuthRequest } from "../middlewares/authenticate";

const router = Router();

// ── GET /api/billing ──────────────────────────────────────────────────────────
// Returns the user's current credit balance and recent transaction history.

router.get("/billing", authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user!.userId);

    const user = await UserModel.findById(userId).select("creditBalance").lean();
    if (!user) return res.status(404).json({ error: "User not found" });

    const transactions = await CreditTransactionModel.find({ userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json({
      balance: user.creditBalance ?? 0,
      transactions: transactions.map((t) => ({
        id: String(t._id),
        type: t.type,
        amount: t.amount,
        balanceAfter: t.balanceAfter,
        description: t.description ?? null,
        campaignId: t.campaignId ? String(t.campaignId) : null,
        createdAt: t.createdAt,
      })),
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

// ── GET /api/billing/transactions ─────────────────────────────────────────────
// Paginated history for the authenticated user only.
router.get("/billing/transactions", authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user!.userId);
    const requestedPage = Number.parseInt(String(req.query.page ?? "1"), 10);
    const requestedLimit = Number.parseInt(String(req.query.limit ?? "25"), 10);
    const page = Number.isFinite(requestedPage) ? Math.max(1, requestedPage) : 1;
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(100, Math.max(1, requestedLimit))
      : 25;
    const skip = (page - 1) * limit;
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [user, transactions, total, monthlyUsageRows] = await Promise.all([
      UserModel.findById(userId).select("creditBalance").lean(),
      CreditTransactionModel.find({ userId })
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      CreditTransactionModel.countDocuments({ userId }),
      CreditTransactionModel.aggregate<{ total: number }>([
        {
          $match: {
            userId,
            type: "DEDUCTION",
            createdAt: { $gte: monthStart },
          },
        },
        {
          $group: {
            _id: null,
            total: {
              $sum: {
                $cond: [
                  { $lt: ["$amount", 0] },
                  { $multiply: ["$amount", -1] },
                  "$amount",
                ],
              },
            },
          },
        },
      ]),
    ]);

    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({
      balance: user.creditBalance ?? 0,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      totalUsedThisMonth: monthlyUsageRows[0]?.total ?? 0,
      transactions: transactions.map((transaction) => ({
        id: String(transaction._id),
        type: transaction.type,
        amount: transaction.amount,
        balanceAfter: transaction.balanceAfter,
        description: transaction.description ?? null,
        createdAt: transaction.createdAt,
      })),
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

// ── POST /api/billing/add-credits ─────────────────────────────────────────────
// Manually add credits (development / admin use). Replace with payment gateway later.

router.post("/billing/add-credits", authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user!.userId);
    const { amount, description } = req.body as { amount: number; description?: string };

    if (!amount || amount <= 0 || !Number.isInteger(amount)) {
      return res.status(400).json({ error: "amount must be a positive integer" });
    }
    if (amount > 100_000) {
      return res.status(400).json({ error: "Maximum top-up is 100,000 credits at a time" });
    }

    const user = await UserModel.findByIdAndUpdate(
      userId,
      { $inc: { creditBalance: amount } },
      { new: true },
    ).lean();
    if (!user) return res.status(404).json({ error: "User not found" });

    await CreditTransactionModel.create({
      userId,
      type: "PURCHASE",
      amount,
      balanceAfter: user.creditBalance ?? 0,
      description: description ?? `Manual top-up of ${amount} credits`,
    });

    res.json({ balance: user.creditBalance ?? 0, added: amount });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

export default router;
