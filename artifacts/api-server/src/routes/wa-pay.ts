import { randomUUID } from "node:crypto";
import { Router } from "express";
import mongoose from "mongoose";
import {
  CreateWaPayOrderBody,
  RefundWaPayOrderParams,
  RefundWaPayOrderBody,
  SaveWaPaySettingsBody,
  UpdateWaPayOrderStatusBody,
  UpdateWaPayOrderStatusParams,
  VerifyWaPayOrderParams,
} from "@workspace/api-zod";
import { authenticate, type AuthRequest } from "../middlewares/authenticate";
import { ContactModel } from "../models/Contact";
import { MessageModel } from "../models/Message";
import { WaPayOrderModel } from "../models/WaPayOrder";
import { WaPaySettingsModel } from "../models/WaPaySettings";
import {
  getCredentials,
  lookupWhatsAppPayment,
  MetaApiError,
  refundWhatsAppPayment,
  sendWhatsAppOrderDetails,
  sendWhatsAppOrderStatus,
} from "../lib/whatsapp";
import {
  calculateWaPayAmounts,
  reconcileMetaPaymentLookup,
  type MetaPaymentLookupResult,
} from "../lib/whatsappPayments";
import { logger } from "../lib/logger";

const router = Router();
const WINDOW_MS = 24 * 60 * 60 * 1000;
const DEFAULT_ORDER_BODY = "Your order is ready. Review the details and pay securely in WhatsApp.";

router.use(authenticate);

function apiDate(value: unknown): string | null {
  return value instanceof Date && Number.isFinite(value.getTime()) ? value.toISOString() : null;
}

function apiOrder(value: unknown): Record<string, unknown> {
  const order = value as Record<string, unknown>;
  const items = Array.isArray(order.items) ? order.items : [];
  const transactions = Array.isArray(order.transactions) ? order.transactions : [];
  const refunds = Array.isArray(order.refunds) ? order.refunds : [];
  return {
    id: String(order._id),
    referenceId: String(order.referenceId),
    contactId: String(order.contactId),
    contactName: String(order.contactName),
    recipientPhone: String(order.recipientPhone),
    goodsType: order.goodsType,
    items: items.map((value) => {
      const item = value as Record<string, unknown>;
      return {
        name: item.name,
        quantity: item.quantity,
        unitAmountValue: item.unitAmountValue,
      };
    }),
    amountValue: order.amountValue,
    currency: order.currency,
    sendStatus: order.sendStatus,
    paymentStatus: order.paymentStatus,
    verificationState: order.verificationState,
    orderStatus: order.orderStatus,
    transactions: transactions.map((value) => {
      const transaction = value as Record<string, unknown>;
      return {
        id: transaction.id,
        gatewayPaymentId: transaction.gatewayPaymentId ?? null,
        status: transaction.status,
        amountValue: transaction.amountValue ?? null,
        method: transaction.method ?? null,
        errorCode: transaction.errorCode ?? null,
        errorReason: transaction.errorReason ?? null,
        updatedAt: apiDate(transaction.updatedAt),
      };
    }),
    refunds: refunds.map((value) => {
      const refund = value as Record<string, unknown>;
      return {
        id: refund.id,
        amountValue: refund.amountValue,
        status: refund.status,
        speedProcessed: refund.speedProcessed ?? null,
        createdAt: apiDate(refund.createdAt),
      };
    }),
    metaMessageId: order.metaMessageId ?? null,
    sendError: order.sendError ?? null,
    lastVerifiedAt: apiDate(order.lastVerifiedAt),
    createdAt: apiDate(order.createdAt),
  };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function generatedReferenceId(): string {
  return `wp_${randomUUID().replaceAll("-", "")}`;
}

function updateOrderFromLookup(
  order: Record<string, unknown>,
  lookup: Extract<MetaPaymentLookupResult, { ok: true }>,
): Record<string, unknown> {
  const currentPaymentStatus = order.paymentStatus === "captured" ? "captured" : "pending";
  const paymentStatus =
    currentPaymentStatus === "captured" || lookup.paymentStatus === "captured"
      ? "captured"
      : "pending";
  return {
    paymentStatus,
    verificationState: "verified",
    verificationWarning: null,
    orderStatus: paymentStatus === "captured"
      ? "captured"
      : order.orderStatus === "captured"
        ? "captured"
        : "pending",
    transactions: lookup.transactions,
    refunds: lookup.refunds,
    lastVerifiedAt: new Date(),
  };
}

async function getOrderForUser(
  id: string,
  userId: mongoose.Types.ObjectId,
) {
  return WaPayOrderModel.findOne({ _id: id, userId });
}

async function clearRefundRequest(
  orderId: mongoose.Types.ObjectId,
  userId: mongoose.Types.ObjectId,
  requestId: string,
): Promise<void> {
  await WaPayOrderModel.updateOne(
    { _id: orderId, userId, refundRequestId: requestId },
    {
      $unset: {
        refundRequestId: 1,
        refundRequestAmountValue: 1,
        refundRequestAt: 1,
      },
    },
  );
}

async function recordOutboundMessage(
  userId: mongoose.Types.ObjectId,
  contactId: mongoose.Types.ObjectId,
  messageId: string,
  body: string,
): Promise<void> {
  try {
    await MessageModel.create({
      userId,
      contactId,
      direction: "OUTBOUND",
      body,
      whatsappMessageId: messageId,
      status: "SENT",
      sentAt: new Date(),
    });
  } catch (error) {
    logger.warn(
      { messageId, error: errorText(error) },
      "WhatsApp Pay message was accepted by Meta but could not be added to Live Chat history",
    );
  }
}

async function verifiedLookup(
  userId: string,
  order: Record<string, unknown>,
): Promise<MetaPaymentLookupResult> {
  const lookup = await lookupWhatsAppPayment(
    userId,
    String(order.phoneNumberId),
    String(order.configurationName),
    String(order.referenceId),
  );
  return reconcileMetaPaymentLookup(lookup, {
    referenceId: String(order.referenceId),
    amountValue: Number(order.amountValue),
  });
}

router.get("/wa-pay", async (req: AuthRequest, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user!.userId);
    const since = new Date(Date.now() - WINDOW_MS);
    const [settings, orders, lastInboundRows, whatsappConnected] = await Promise.all([
      WaPaySettingsModel.findOne({ userId }).lean(),
      WaPayOrderModel.find({ userId }).sort({ createdAt: -1 }).limit(100).lean(),
      MessageModel.aggregate<{ _id: mongoose.Types.ObjectId; lastInboundAt: Date }>([
        {
          $match: {
            userId,
            direction: "INBOUND",
            createdAt: { $gte: since },
          },
        },
        { $sort: { createdAt: -1 } },
        { $group: { _id: "$contactId", lastInboundAt: { $first: "$createdAt" } } },
        { $sort: { lastInboundAt: -1 } },
        { $limit: 100 },
      ]),
      getCredentials(req.user!.userId, { allowEnvFallback: false })
        .then((credentials) => Boolean(credentials.phoneNumberId))
        .catch(() => false),
    ]);

    const contactIds = lastInboundRows.map((row) => row._id);
    const activeContacts = contactIds.length
      ? await ContactModel.find({
          _id: { $in: contactIds },
          userId,
          status: "active",
        })
          .select("_id name phone")
          .lean()
      : [];
    const contactsById = new Map(activeContacts.map((contact) => [String(contact._id), contact]));
    const eligibleContacts = lastInboundRows.flatMap((row) => {
      const contact = contactsById.get(String(row._id));
      if (!contact) return [];
      const lastInboundAt = row.lastInboundAt;
      return [{
        id: String(contact._id),
        name: contact.name,
        phone: contact.phone,
        lastInboundAt: lastInboundAt.toISOString(),
        windowExpiresAt: new Date(lastInboundAt.getTime() + WINDOW_MS).toISOString(),
      }];
    });

    res.json({
      settings: {
        gateway: "razorpay",
        configurationName: settings?.configurationName ?? null,
        paymentConfigId: settings?.paymentConfigId ?? null,
      },
      whatsappConnected,
      eligibleContacts,
      orders: orders.map(apiOrder),
    });
  } catch (error) {
    logger.error({ error: errorText(error) }, "Could not load WhatsApp Pay dashboard");
    res.status(500).json({ error: "Could not load WhatsApp Pay data" });
  }
});

router.put("/wa-pay/settings", async (req: AuthRequest, res) => {
  const parsed = SaveWaPaySettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid payment configuration" });
    return;
  }

  const configurationName = parsed.data.configurationName.trim();
  const paymentConfigId = parsed.data.paymentConfigId?.trim() || null;
  if (!configurationName) {
    res.status(400).json({ error: "Enter the exact Razorpay configuration name linked in WhatsApp Manager" });
    return;
  }

  try {
    const userId = new mongoose.Types.ObjectId(req.user!.userId);
    const settings = await WaPaySettingsModel.findOneAndUpdate(
      { userId },
      {
        $set: {
          userId,
          gateway: "razorpay",
          configurationName,
          paymentConfigId,
        },
      },
      { upsert: true, new: true, runValidators: true },
    ).lean();
    res.json({
      gateway: "razorpay",
      configurationName: settings?.configurationName ?? configurationName,
      paymentConfigId: settings?.paymentConfigId ?? paymentConfigId,
    });
  } catch (error) {
    logger.error({ error: errorText(error) }, "Could not save WhatsApp Pay settings");
    res.status(500).json({ error: "Could not save WhatsApp Pay settings" });
  }
});

router.post("/wa-pay/orders", async (req: AuthRequest, res) => {
  const parsed = CreateWaPayOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid order" });
    return;
  }

  const input = parsed.data;
  const userIdString = req.user!.userId;
  const userId = new mongoose.Types.ObjectId(userIdString);

  try {
    const settings = await WaPaySettingsModel.findOne({ userId }).lean();
    if (!settings?.configurationName) {
      res.status(409).json({ error: "Save the Razorpay configuration name before creating an order" });
      return;
    }

    const credentials = await getCredentials(userIdString, { allowEnvFallback: false });
    const contactId = new mongoose.Types.ObjectId(input.contactId);
    const contact = await ContactModel.findOne({
      _id: contactId,
      userId,
      status: "active",
    })
      .select("_id name phone")
      .lean();
    if (!contact) {
      res.status(404).json({ error: "Contact not found or not active" });
      return;
    }

    const latestInbound = await MessageModel.findOne({
      userId,
      contactId,
      direction: "INBOUND",
    })
      .sort({ createdAt: -1 })
      .select("createdAt")
      .lean();
    if (!latestInbound?.createdAt || Date.now() - latestInbound.createdAt.getTime() >= WINDOW_MS) {
      res.status(409).json({ error: "The customer's 24-hour WhatsApp service window is closed" });
      return;
    }

    let amounts;
    try {
      amounts = calculateWaPayAmounts(input);
    } catch (error) {
      res.status(400).json({ error: errorText(error) });
      return;
    }

    const messageBody = input.body?.trim() || DEFAULT_ORDER_BODY;
    const messageFooter = input.footer?.trim() || undefined;
    const referenceId = generatedReferenceId();
    const order = await WaPayOrderModel.create({
      userId,
      contactId,
      contactName: contact.name,
      recipientPhone: contact.phone,
      phoneNumberId: credentials.phoneNumberId,
      configurationName: settings.configurationName,
      paymentConfigId: settings.paymentConfigId ?? null,
      referenceId,
      goodsType: input.goodsType,
      items: input.items,
      beneficiaries: input.goodsType === "physical-goods" ? input.beneficiaries : [],
      ...amounts,
      currency: "INR",
      sendStatus: "sending",
      paymentStatus: "pending",
      verificationState: "unverified",
      orderStatus: "pending",
      transactions: [],
      refunds: [],
      messageBody,
      messageFooter,
    });

    let sent: { messageId: string };
    try {
      sent = await sendWhatsAppOrderDetails({
        userId: userIdString,
        expectedPhoneNumberId: credentials.phoneNumberId,
        recipientPhone: contact.phone,
        referenceId,
        configurationName: settings.configurationName,
        messageBody,
        messageFooter,
        orderInput: input,
        amounts,
      });
    } catch (error) {
      const sendError = errorText(error).slice(0, 500);
      await WaPayOrderModel.updateOne(
        { _id: order._id, userId },
        { $set: { sendStatus: "failed", sendError } },
      );
      logger.warn(
        { userId: userIdString, orderId: String(order._id), error: sendError },
        "Meta rejected WhatsApp Pay order-details message",
      );
      res.status(502).json({ error: sendError || "WhatsApp rejected the payment request" });
      return;
    }

    const saved = await WaPayOrderModel.findOneAndUpdate(
      { _id: order._id, userId },
      { $set: { sendStatus: "sent", metaMessageId: sent.messageId, sendError: null } },
      { new: true },
    ).lean();
    await recordOutboundMessage(
      userId,
      contactId,
      sent.messageId,
      `WhatsApp payment request ${referenceId} for ₹${(amounts.amountValue / 100).toFixed(2)}`,
    );
    res.status(201).json(apiOrder(saved ?? order));
  } catch (error) {
    logger.error({ userId: userIdString, error: errorText(error) }, "Could not create WhatsApp Pay order");
    res.status(500).json({ error: "Could not create the payment request" });
  }
});

router.post("/wa-pay/orders/:id/verify", async (req: AuthRequest, res) => {
  const parsed = VerifyWaPayOrderParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payment order ID" });
    return;
  }
  const userIdString = req.user!.userId;
  const userId = new mongoose.Types.ObjectId(userIdString);

  try {
    const order = await getOrderForUser(parsed.data.id, userId);
    if (!order) {
      res.status(404).json({ error: "Payment order not found" });
      return;
    }
    if (order.sendStatus !== "sent") {
      res.status(409).json({ error: "Only a payment request accepted by WhatsApp can be verified" });
      return;
    }

    const result = await verifiedLookup(userIdString, order as unknown as Record<string, unknown>);
    if (!result.ok) {
      const warning = result.reason;
      await WaPayOrderModel.updateOne(
        { _id: order._id, userId },
        {
          $set: {
            verificationState: "mismatch",
            verificationWarning: warning,
            lastVerifiedAt: new Date(),
          },
        },
      );
      res.status(409).json({ error: warning });
      return;
    }

    const updated = await WaPayOrderModel.findOneAndUpdate(
      { _id: order._id, userId },
      { $set: updateOrderFromLookup(order.toObject(), result) },
      { new: true },
    ).lean();
    res.json(apiOrder(updated ?? order.toObject()));
  } catch (error) {
    const status = error instanceof MetaApiError ? 502 : 500;
    logger.error(
      { userId: userIdString, orderId: parsed.data.id, error: errorText(error) },
      "Could not verify WhatsApp Pay order",
    );
    res.status(status).json({
      error: error instanceof MetaApiError
        ? "Meta payment lookup failed"
        : errorText(error),
    });
  }
});

router.post("/wa-pay/orders/:id/refund", async (req: AuthRequest, res) => {
  const params = RefundWaPayOrderParams.safeParse(req.params);
  const parsed = RefundWaPayOrderBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: "Invalid payment order ID" });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid refund request" });
    return;
  }
  const userIdString = req.user!.userId;
  const userId = new mongoose.Types.ObjectId(userIdString);

  try {
    const order = await getOrderForUser(params.data.id, userId);
    if (!order) {
      res.status(404).json({ error: "Payment order not found" });
      return;
    }
    const settings = await WaPaySettingsModel.findOne({ userId }).lean();
    const paymentConfigId = order.paymentConfigId || settings?.paymentConfigId;
    if (!paymentConfigId) {
      res.status(409).json({ error: "Add the Meta payment configuration ID before requesting a refund" });
      return;
    }

    const result = await verifiedLookup(userIdString, order as unknown as Record<string, unknown>);
    if (!result.ok || result.paymentStatus !== "captured") {
      const reason = result.ok ? "Meta has not confirmed that this payment was captured" : result.reason;
      await WaPayOrderModel.updateOne(
        { _id: order._id, userId },
        {
          $set: {
            verificationState: result.ok ? "verified" : "mismatch",
            verificationWarning: result.ok ? null : reason,
            lastVerifiedAt: new Date(),
            ...(result.ok ? updateOrderFromLookup(order.toObject(), result) : {}),
          },
        },
      );
      res.status(409).json({ error: reason });
      return;
    }

    const reconciledOrder = await WaPayOrderModel.findOneAndUpdate(
      { _id: order._id, userId },
      { $set: updateOrderFromLookup(order.toObject(), result) },
      { new: true },
    );
    if (!reconciledOrder || reconciledOrder.paymentStatus !== "captured") {
      res.status(409).json({ error: "Meta payment lookup did not confirm a captured payment" });
      return;
    }

    if (reconciledOrder.refundRequestId) {
      const requestAt = reconciledOrder.refundRequestAt;
      const foundInMeta = result.refunds.some((refund) =>
        refund.amountValue === reconciledOrder.refundRequestAmountValue &&
        refund.createdAt instanceof Date &&
        requestAt instanceof Date &&
        refund.createdAt >= requestAt,
      );
      if (foundInMeta) {
        await clearRefundRequest(order._id, userId, reconciledOrder.refundRequestId);
      } else {
        res.status(409).json({
          error: "A previous refund request is still unresolved with Meta. Refresh its status before retrying.",
        });
        return;
      }
    }

    const reservedRefundValue = result.refunds
      .filter((refund) => refund.status === "pending" || refund.status === "success")
      .reduce((total, refund) => total + refund.amountValue, 0);
    const refundableBalance = reconciledOrder.amountValue - reservedRefundValue;
    if (
      !Number.isSafeInteger(parsed.data.amountValue) ||
      parsed.data.amountValue <= 0 ||
      parsed.data.amountValue > refundableBalance
    ) {
      res.status(409).json({ error: "Refund amount exceeds the remaining refundable balance" });
      return;
    }

    const refundRequestId = randomUUID();
    const refundRequestedAt = new Date();
    const claimedOrder = await WaPayOrderModel.findOneAndUpdate(
      {
        _id: order._id,
        userId,
        paymentStatus: "captured",
        refundRequestId: null,
      },
      {
        $set: {
          refundRequestId,
          refundRequestAmountValue: parsed.data.amountValue,
          refundRequestAt: refundRequestedAt,
        },
      },
      { new: true },
    );
    if (!claimedOrder) {
      res.status(409).json({
        error: "Another refund request is already in progress for this order",
      });
      return;
    }

    let refundResponse: Awaited<ReturnType<typeof refundWhatsAppPayment>>;
    try {
      refundResponse = await refundWhatsAppPayment({
        userId: userIdString,
        expectedPhoneNumberId: claimedOrder.phoneNumberId,
        paymentConfigId,
        referenceId: claimedOrder.referenceId,
        amountValue: parsed.data.amountValue,
        speed: parsed.data.speed,
      });
    } catch (error) {
      if (error instanceof MetaApiError && error.status < 500) {
        await clearRefundRequest(order._id, userId, refundRequestId);
      }
      throw error;
    }
    if (refundResponse.success === false || refundResponse.status === "failed") {
      await clearRefundRequest(order._id, userId, refundRequestId);
      res.status(502).json({ error: "Meta did not accept the refund request" });
      return;
    }

    const responseId =
      typeof refundResponse.refund_id === "string"
        ? refundResponse.refund_id
        : typeof refundResponse.id === "string"
          ? refundResponse.id
          : `pending-${randomUUID()}`;
    const responseStatus =
      refundResponse.status === "success" || refundResponse.status === "failed"
        ? refundResponse.status
        : "pending";
    const refund = {
      id: responseId,
      amountValue: parsed.data.amountValue,
      status: responseStatus,
      speedProcessed: parsed.data.speed,
      createdAt: new Date(),
    };
    const updated = await WaPayOrderModel.findOneAndUpdate(
      { _id: order._id, userId, refundRequestId },
      {
        $push: { refunds: refund },
        $unset: {
          refundRequestId: 1,
          refundRequestAmountValue: 1,
          refundRequestAt: 1,
        },
      },
      { new: true },
    ).lean();
    if (!updated) {
      const latest = await WaPayOrderModel.findOne({ _id: order._id, userId }).lean();
      const alreadyConfirmed = latest?.refunds?.some((savedRefund) =>
        savedRefund.amountValue === parsed.data.amountValue &&
        savedRefund.status !== "failed" &&
        savedRefund.createdAt instanceof Date &&
        savedRefund.createdAt >= refundRequestedAt,
      );
      if (latest && alreadyConfirmed) {
        res.json(apiOrder(latest));
        return;
      }
      res.status(500).json({
        error: "Meta accepted the refund, but local status could not be saved. Refresh from Meta before retrying.",
      });
      return;
    }
    res.json(apiOrder(updated));
  } catch (error) {
    const status = error instanceof MetaApiError ? 502 : 500;
    logger.error(
      { userId: userIdString, orderId: params.data.id, error: errorText(error) },
      "Could not refund WhatsApp Pay order",
    );
    res.status(status).json({
      error: error instanceof MetaApiError
        ? "Meta could not accept the refund"
        : errorText(error),
    });
  }
});

router.post("/wa-pay/orders/:id/status", async (req: AuthRequest, res) => {
  const params = UpdateWaPayOrderStatusParams.safeParse(req.params);
  const parsed = UpdateWaPayOrderStatusBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: "Invalid payment order ID" });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid order status" });
    return;
  }
  const userIdString = req.user!.userId;
  const userId = new mongoose.Types.ObjectId(userIdString);

  try {
    const order = await getOrderForUser(params.data.id, userId);
    if (!order) {
      res.status(404).json({ error: "Payment order not found" });
      return;
    }
    if (order.sendStatus !== "sent") {
      res.status(409).json({ error: "Only a payment request accepted by WhatsApp can have a status update" });
      return;
    }

    const result = await verifiedLookup(userIdString, order as unknown as Record<string, unknown>);
    if (!result.ok) {
      res.status(409).json({ error: result.reason });
      return;
    }
    if (parsed.data.status === "captured" && result.paymentStatus !== "captured") {
      res.status(409).json({ error: "Meta has not confirmed that this payment was captured" });
      return;
    }
    if (parsed.data.status === "failed") {
      const allAttemptsFailed =
        result.transactions.length > 0 &&
        result.transactions.every((transaction) => transaction.status === "failed");
      if (!allAttemptsFailed) {
        res.status(409).json({ error: "Meta has not confirmed that all payment attempts failed" });
        return;
      }
    }
    if (parsed.data.status === "pending" && result.paymentStatus === "captured") {
      res.status(409).json({ error: "A captured payment cannot be changed back to pending" });
      return;
    }

    await WaPayOrderModel.updateOne(
      { _id: order._id, userId },
      { $set: updateOrderFromLookup(order.toObject(), result) },
    );
    const sent = await sendWhatsAppOrderStatus({
      userId: userIdString,
      expectedPhoneNumberId: order.phoneNumberId,
      recipientPhone: order.recipientPhone,
      referenceId: order.referenceId,
      status: parsed.data.status,
      description: parsed.data.description?.trim() || undefined,
    });
    const messageBody = parsed.data.description?.trim() || `Payment status: ${parsed.data.status}`;
    await recordOutboundMessage(userId, order.contactId, sent.messageId, messageBody);
    const updated = await WaPayOrderModel.findOneAndUpdate(
      { _id: order._id, userId },
      { $set: { orderStatus: parsed.data.status } },
      { new: true },
    ).lean();
    res.json(apiOrder(updated ?? order.toObject()));
  } catch (error) {
    const status = error instanceof MetaApiError ? 502 : 500;
    logger.error(
      { userId: userIdString, orderId: params.data.id, error: errorText(error) },
      "Could not update WhatsApp Pay order status",
    );
    res.status(status).json({
      error: error instanceof MetaApiError
        ? "WhatsApp rejected the order-status update"
        : errorText(error),
    });
  }
});

export default router;