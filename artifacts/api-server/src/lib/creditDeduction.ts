import mongoose from "mongoose";
import { CreditSettingModel } from "../models/CreditSetting";
import { CreditTransactionModel } from "../models/CreditTransaction";
import { UserModel } from "../models/User";

const CREDITS_PER_MESSAGE_KEY = "creditsPerMessage";

export class InsufficientCreditsError extends Error {
  constructor() {
    super("Insufficient credits to send this WhatsApp message.");
    this.name = "InsufficientCreditsError";
  }
}

type CreditChargeOptions = {
  userId: mongoose.Types.ObjectId | string;
  description: string;
  campaignId?: mongoose.Types.ObjectId | string;
  send: () => Promise<unknown>;
};

function objectId(value: mongoose.Types.ObjectId | string) {
  return value instanceof mongoose.Types.ObjectId
    ? value
    : new mongoose.Types.ObjectId(value);
}

async function creditsPerMessage(): Promise<number> {
  const setting = await CreditSettingModel.findOne({
    key: CREDITS_PER_MESSAGE_KEY,
  })
    .select("value")
    .lean();

  if (!setting || !Number.isInteger(setting.value) || setting.value <= 0) {
    throw new Error(
      `Credit setting "${CREDITS_PER_MESSAGE_KEY}" is missing or invalid.`,
    );
  }

  return setting.value;
}

/**
 * Reserve credits atomically before sending, then finalize the deduction only
 * after Meta succeeds. A failed Meta request gets an atomic reservation refund.
 */
export async function withCreditCharge({
  userId,
  description,
  campaignId,
  send,
}: CreditChargeOptions): Promise<unknown> {
  const resolvedUserId = objectId(userId);
  const amount = await creditsPerMessage();

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

  try {
    const result = await send();
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
  } catch (error) {
    await UserModel.findByIdAndUpdate(resolvedUserId, {
      $inc: { creditBalance: amount },
    });
    throw error;
  }
}