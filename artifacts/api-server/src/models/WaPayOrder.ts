import { Schema, type InferSchemaType } from "mongoose";
import { tenantModel } from "../lib/tenantDatabase";

const importerAddressSchema = new Schema(
  {
    addressLine1: { type: String, required: true, maxlength: 100 },
    addressLine2: { type: String, maxlength: 100 },
    city: { type: String, required: true, maxlength: 100 },
    zoneCode: { type: String, required: true, maxlength: 60 },
    postalCode: { type: String, required: true, maxlength: 20 },
    countryCode: { type: String, required: true, minlength: 2, maxlength: 2 },
  },
  { _id: false },
);

const orderItemSchema = new Schema(
  {
    name: { type: String, required: true, maxlength: 60 },
    quantity: { type: Number, required: true, min: 1, max: 100 },
    unitAmountValue: { type: Number, required: true, min: 1 },
    countryOfOrigin: { type: String, maxlength: 80 },
    importerName: { type: String, maxlength: 200 },
    importerAddress: importerAddressSchema,
  },
  { _id: false },
);

const beneficiarySchema = new Schema(
  {
    name: { type: String, required: true, maxlength: 200 },
    addressLine1: { type: String, required: true, maxlength: 100 },
    addressLine2: { type: String, maxlength: 100 },
    city: { type: String, required: true, maxlength: 100 },
    state: { type: String, required: true, maxlength: 100 },
    postalCode: { type: String, required: true, match: /^\d{6}$/ },
  },
  { _id: false },
);

const transactionSchema = new Schema(
  {
    id: { type: String, required: true },
    gatewayPaymentId: { type: String, default: null },
    status: { type: String, enum: ["pending", "success", "failed"], required: true },
    amountValue: { type: Number, default: null },
    method: { type: String, default: null },
    errorCode: { type: String, default: null },
    errorReason: { type: String, default: null },
    createdAt: { type: Date, default: null },
    updatedAt: { type: Date, default: null },
  },
  { _id: false },
);

const refundSchema = new Schema(
  {
    id: { type: String, required: true },
    amountValue: { type: Number, required: true, min: 1 },
    status: { type: String, enum: ["pending", "success", "failed"], required: true },
    speedProcessed: { type: String, enum: ["instant", "normal"], default: null },
    createdAt: { type: Date, default: null },
  },
  { _id: false },
);

const waPayOrderSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    contactId: { type: Schema.Types.ObjectId, ref: "Contact", required: true, index: true },
    contactName: { type: String, required: true, maxlength: 255 },
    recipientPhone: { type: String, required: true, maxlength: 32 },
    phoneNumberId: { type: String, required: true, maxlength: 64 },
    configurationName: { type: String, required: true, maxlength: 60 },
    paymentConfigId: { type: String, default: null, maxlength: 128 },
    referenceId: { type: String, required: true, maxlength: 35 },
    goodsType: { type: String, enum: ["digital-goods", "physical-goods"], required: true },
    items: { type: [orderItemSchema], required: true },
    beneficiaries: { type: [beneficiarySchema], default: [] },
    subtotalValue: { type: Number, required: true, min: 1 },
    taxValue: { type: Number, required: true, min: 0 },
    shippingValue: { type: Number, required: true, min: 0 },
    discountValue: { type: Number, required: true, min: 0 },
    amountValue: { type: Number, required: true, min: 1 },
    currency: { type: String, enum: ["INR"], default: "INR", required: true },
    sendStatus: { type: String, enum: ["sending", "sent", "failed"], default: "sending", required: true },
    paymentStatus: { type: String, enum: ["pending", "captured"], default: "pending", required: true },
    verificationState: {
      type: String,
      enum: ["unverified", "verified", "mismatch"],
      default: "unverified",
      required: true,
    },
    verificationWarning: { type: String, default: null, maxlength: 500 },
    orderStatus: { type: String, enum: ["pending", "captured", "failed"], default: "pending", required: true },
    transactions: { type: [transactionSchema], default: [] },
    refunds: { type: [refundSchema], default: [] },
    refundRequestId: { type: String, default: null, maxlength: 64 },
    refundRequestAmountValue: { type: Number, default: null, min: 1 },
    refundRequestAt: { type: Date, default: null },
    metaMessageId: { type: String, default: null, maxlength: 255 },
    sendError: { type: String, default: null, maxlength: 500 },
    lastVerifiedAt: { type: Date, default: null },
    messageBody: { type: String, required: true, maxlength: 1024 },
    messageFooter: { type: String, default: null, maxlength: 60 },
    webOnlyPayment: { type: Boolean, default: false, required: true },
  },
  { timestamps: true },
);

waPayOrderSchema.index({ userId: 1, referenceId: 1 }, { unique: true });
waPayOrderSchema.index({ userId: 1, createdAt: -1 });

export type WaPayOrderRecord = InferSchemaType<typeof waPayOrderSchema>;

export const WaPayOrderModel = tenantModel<WaPayOrderRecord>("WaPayOrder", waPayOrderSchema);