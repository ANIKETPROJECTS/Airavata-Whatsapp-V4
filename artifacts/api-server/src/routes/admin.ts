import { Router } from "express";
import mongoose from "mongoose";
import { authenticate, requireAdmin, type AuthRequest } from "../middlewares/authenticate";
import { UserModel } from "../models/User";
import { CreditTransactionModel } from "../models/CreditTransaction";
import { CreditSettingModel } from "../models/CreditSetting";

const router = Router();
router.use(authenticate, requireAdmin);

router.get("/admin/users", async (_req: AuthRequest, res) => {
  try {
    const users = await UserModel.find()
      .select("businessName email phone role creditBalance metaWabaConnected createdAt")
      .sort({ createdAt: 1 })
      .lean();

    res.json({
      users: users.map((user) => ({
        id: String(user._id),
        businessName: user.businessName,
        email: user.email,
        phone: user.phone ?? null,
        role: user.role ?? "client",
        creditBalance: user.creditBalance ?? 0,
        metaWabaConnected: user.metaWabaConnected ?? false,
        createdAt: user.createdAt,
      })),
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unable to load users" });
  }
});

router.post("/admin/users/:id/credits", async (req: AuthRequest, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      res.status(400).json({ error: "Invalid user ID" });
      return;
    }

    const { amount, description } = req.body as {
      amount?: number;
      description?: string;
    };
    if (!Number.isInteger(amount) || !amount || amount < 1 || amount > 100_000) {
      res.status(400).json({ error: "amount must be an integer between 1 and 100,000" });
      return;
    }

    const userId = new mongoose.Types.ObjectId(req.params.id);
    const user = await UserModel.findByIdAndUpdate(
      userId,
      { $inc: { creditBalance: amount } },
      { new: true },
    ).lean();
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    await CreditTransactionModel.create({
      userId,
      type: "PURCHASE",
      amount,
      balanceAfter: user.creditBalance ?? 0,
      description: description?.trim() || `Admin top-up of ${amount} credits`,
    });

    res.json({
      userId: String(user._id),
      balance: user.creditBalance ?? 0,
      added: amount,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unable to add credits" });
  }
});

router.get("/admin/credit-setting", async (_req, res) => {
  try {
    const setting = await CreditSettingModel.findOne({ key: "messageRates" })
      .select("authenticationRate utilityRate marketingRate updatedAt")
      .lean();
    if (!setting) {
      res.status(404).json({ error: "Credit rate setting is not configured" });
      return;
    }
    res.json({
      authenticationRate: setting.authenticationRate,
      utilityRate: setting.utilityRate,
      marketingRate: setting.marketingRate,
      updatedAt: setting.updatedAt,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unable to load credit rate" });
  }
});

router.put("/admin/credit-setting", async (req, res) => {
  try {
    const { authenticationRate, utilityRate, marketingRate } = req.body as {
      authenticationRate?: number;
      utilityRate?: number;
      marketingRate?: number;
    };
    const rates = { authenticationRate, utilityRate, marketingRate };
    if (Object.values(rates).some((value) => !Number.isInteger(value) || !value || value < 1 || value > 1000)) {
      res.status(400).json({ error: "All message rates must be whole numbers from 1 to 1,000" });
      return;
    }

    const setting = await CreditSettingModel.findOneAndUpdate(
      { key: "messageRates" },
      { $set: { authenticationRate, utilityRate, marketingRate } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();

    res.json({
      authenticationRate: setting!.authenticationRate,
      utilityRate: setting!.utilityRate,
      marketingRate: setting!.marketingRate,
      updatedAt: setting!.updatedAt,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unable to save credit rate" });
  }
});

export default router;