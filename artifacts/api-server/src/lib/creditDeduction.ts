import mongoose from "mongoose";
import { CreditSettingModel } from "../models/CreditSetting";
import { CreditTransactionModel } from "../models/CreditTransaction";
import { UserModel } from "../models/User";

const MESSAGE_RATES_KEY = "messageRates";
export type MessageCategory = "AUTHENTICATION" | "UTILITY" | "MARKETING";

export class InsufficientCreditsError extends Error {
  constructor() {
    super("Insufficient credits to send this WhatsApp message.");
    this.name = "InsufficientCreditsError";
  }
}

type CreditChargeOptions<T> = {
  userId: mongoose.Types.ObjectId | string;
  description: string;
  category?: MessageCategory;
  campaignId?: mongoose.Types.ObjectId | string;
  send: () => Promise<T>;
};

function objectId(value: mongoose.Types.ObjectId | string) {
  return value instanceof mongoose.Types.ObjectId
    ? value
    : new mongoose.Types.ObjectId(value);
}

async function creditsForCategory(category?: MessageCategory): Promise<number> {
  // Non-template/session messages have no Meta template category and remain free.
  if (!category) return 0;

  const setting = await CreditSettingModel.findOne({
    key: MESSAGE_RATES_KEY,
  })
    .select("authenticationRate utilityRate marketingRate")
    .lean();

  const field = {
    AUTHENTICATION: "authenticationRate",
    UTILITY: "utilityRate",
    MARKETING: "marketingRate",
  }[category] as "authenticationRate" | "utilityRate" | "marketingRate";
  const amount = setting?.[field];

  if (!setting || !Number.isInteger(amount) || amount <= 0) {
    throw new Error(
      `Credit rate "${field}" is missing or invalid.`,
    );
  }

  return amount;
}

/**
 * Reserve credits atomically before sending, then finalize the deduction only
 * after Meta succeeds. A failed Meta request gets an atomic reservation refund.
 */
export async function withCreditCharge<T>({
  userId,
  description,
  category,
  campaignId,
  send,
}: CreditChargeOptions<T>): Promise<T> {
  const resolvedUserId = objectId(userId);
  const amount = await creditsForCategory(category);
  if (amount === 0) {
    return send();
  }

  const reservedUser = await UserModel.findOneAndUpdate(
    {
      _id: resolvedUserId,
      creditBalance: { $gte: amount },
    },
    { $inc: { creditBalance: -amount } },
    { new: true },
  )
    .select("creditBalance")
    .lean();

  if (!reservedUser) {
    throw new InsufficientCreditsError();
  }

  let result: T;
  try {
    result = await send();
  } catch (error) {
    await UserModel.findByIdAndUpdate(resolvedUserId, {
      $inc: { creditBalance: amount },
    });
    throw error;
  }

  const currentUser = await UserModel.findById(resolvedUserId)
    .select("creditBalance")
    .lean();

  await CreditTransactionModel.create({
    userId: resolvedUserId,
    type: "DEDUCTION",
    amount: -amount,
    balanceAfter: currentUser?.creditBalance ?? reservedUser.creditBalance,
    ...(campaignId ? { campaignId: objectId(campaignId) } : {}),
    description,
  });

  return result;
}