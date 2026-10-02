import type { WaPayOrderInput } from "@workspace/api-zod";

export const INR_OFFSET = 100;
export const UPI_MAX_AMOUNT_VALUE = 50_000_000;

export type WaPayCreateOrderInput = WaPayOrderInput;

export interface WaPayOrderAmounts {
  subtotalValue: number;
  taxValue: number;
  shippingValue: number;
  discountValue: number;
  amountValue: number;
  webOnlyPayment: boolean;
}

export interface MetaPaymentTransaction {
  id: string;
  gatewayPaymentId: string | null;
  status: "pending" | "success" | "failed";
  amountValue: number | null;
  method: string | null;
  errorCode: string | null;
  errorReason: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface MetaPaymentRefund {
  id: string;
  amountValue: number;
  status: "pending" | "success" | "failed";
  speedProcessed: "instant" | "normal" | null;
  createdAt: Date | null;
}

export type MetaPaymentLookupResult =
  | {
      ok: true;
      paymentStatus: "pending" | "captured";
      transactions: MetaPaymentTransaction[];
      refunds: MetaPaymentRefund[];
    }
  | { ok: false; reason: string };

function isSafeNonNegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function calculateWaPayAmounts(input: WaPayCreateOrderInput): WaPayOrderAmounts {
  const subtotalValue = input.items.reduce((total, item) => {
    if (
      !Number.isSafeInteger(item.quantity) ||
      item.quantity < 1 ||
      !Number.isSafeInteger(item.unitAmountValue) ||
      item.unitAmountValue < 1
    ) {
      throw new Error("Item quantities and prices must be positive whole paise amounts");
    }
    const lineTotal = item.quantity * item.unitAmountValue;
    if (!Number.isSafeInteger(lineTotal) || !Number.isSafeInteger(total + lineTotal)) {
      throw new Error("Order amount exceeds the supported integer range");
    }
    return total + lineTotal;
  }, 0);

  const taxValue = input.taxValue ?? 0;
  const shippingValue = input.shippingValue ?? 0;
  const discountValue = input.discountValue ?? 0;
  if (![taxValue, shippingValue, discountValue].every(isSafeNonNegativeInteger)) {
    throw new Error("Tax, shipping, and discount must be non-negative whole paise amounts");
  }

  const grossValue = subtotalValue + taxValue + shippingValue;
  if (!Number.isSafeInteger(grossValue) || discountValue > grossValue) {
    throw new Error("Discount cannot exceed the order subtotal, tax, and shipping total");
  }

  const amountValue = grossValue - discountValue;
  if (!Number.isSafeInteger(amountValue) || amountValue <= 0) {
    throw new Error("Order total must be greater than zero");
  }

  if (input.goodsType === "physical-goods") {
    if (!input.beneficiaries?.length) {
      throw new Error("A shipping beneficiary is required for physical goods");
    }
    const missingImporter = input.items.some((item) =>
      !item.countryOfOrigin?.trim() ||
      !item.importerName?.trim() ||
      !item.importerAddress?.addressLine1?.trim() ||
      !item.importerAddress?.city?.trim() ||
      !item.importerAddress?.zoneCode?.trim() ||
      !item.importerAddress?.postalCode?.trim() ||
      !item.importerAddress?.countryCode?.trim(),
    );
    if (missingImporter) {
      throw new Error("Origin and importer details are required for each physical item");
    }
  }

  return {
    subtotalValue,
    taxValue,
    shippingValue,
    discountValue,
    amountValue,
    webOnlyPayment: amountValue > UPI_MAX_AMOUNT_VALUE,
  };
}

export function buildOrderDetailsParameters(
  input: WaPayCreateOrderInput,
  amounts: WaPayOrderAmounts,
  referenceId: string,
  configurationName: string,
): Record<string, unknown> {
  const parameters: Record<string, unknown> = {
    reference_id: referenceId,
    type: input.goodsType,
    payment_settings: [
      {
        type: "payment_gateway",
        payment_gateway: {
          type: "razorpay",
          configuration_name: configurationName,
        },
      },
    ],
    currency: "INR",
    total_amount: { value: amounts.amountValue, offset: INR_OFFSET },
    order: {
      status: "pending",
      items: input.items.map((item) => ({
        name: item.name,
        amount: { value: item.unitAmountValue, offset: INR_OFFSET },
        quantity: item.quantity,
        ...(input.goodsType === "physical-goods"
          ? {
              country_of_origin: item.countryOfOrigin,
              importer_name: item.importerName,
              importer_address: {
                address_line1: item.importerAddress?.addressLine1,
                ...(item.importerAddress?.addressLine2
                  ? { address_line2: item.importerAddress.addressLine2 }
                  : {}),
                city: item.importerAddress?.city,
                zone_code: item.importerAddress?.zoneCode,
                postal_code: item.importerAddress?.postalCode,
                country_code: item.importerAddress?.countryCode,
              },
            }
          : {}),
      })),
      subtotal: { value: amounts.subtotalValue, offset: INR_OFFSET },
      tax: { value: amounts.taxValue, offset: INR_OFFSET },
      ...(amounts.shippingValue > 0
        ? { shipping: { value: amounts.shippingValue, offset: INR_OFFSET } }
        : {}),
      ...(amounts.discountValue > 0
        ? { discount: { value: amounts.discountValue, offset: INR_OFFSET } }
        : {}),
    },
  };

  if (input.goodsType === "physical-goods") {
    parameters.beneficiaries = input.beneficiaries!.map((beneficiary) => ({
      name: beneficiary.name,
      address_line1: beneficiary.addressLine1,
      ...(beneficiary.addressLine2 ? { address_line2: beneficiary.addressLine2 } : {}),
      city: beneficiary.city,
      state: beneficiary.state,
      country: "India",
      postal_code: beneficiary.postalCode,
    }));
  }
  if (amounts.webOnlyPayment) {
    parameters.enabled_payment_options = ["web"];
  }
  return parameters;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function integer(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function dateFromEpoch(value: unknown): Date | null {
  const seconds = integer(value);
  return seconds === null || seconds < 0 ? null : new Date(seconds * 1000);
}

function amountFromMeta(value: unknown): number | null {
  const amount = record(value);
  if (!amount || integer(amount.offset) !== INR_OFFSET) return null;
  const amountValue = integer(amount.value);
  return amountValue !== null && amountValue >= 0 ? amountValue : null;
}

export function reconcileMetaPaymentLookup(
  lookupValue: unknown,
  expected: { referenceId: string; amountValue: number },
): MetaPaymentLookupResult {
  const lookup = record(lookupValue);
  if (!lookup) return { ok: false, reason: "Meta returned an invalid payment lookup response" };
  if (lookup.reference_id !== expected.referenceId) {
    return { ok: false, reason: "Meta returned a different payment reference" };
  }
  if (lookup.currency !== "INR") {
    return { ok: false, reason: "Meta returned a payment in an unexpected currency" };
  }
  if (amountFromMeta(lookup.amount) !== expected.amountValue) {
    return { ok: false, reason: "Meta payment amount does not match the order total" };
  }
  if (lookup.status !== "pending" && lookup.status !== "captured") {
    return { ok: false, reason: "Meta returned an unsupported payment status" };
  }

  const rawTransactions = Array.isArray(lookup.transactions) ? lookup.transactions : [];
  const transactions: MetaPaymentTransaction[] = rawTransactions.flatMap((value, index) => {
    const transaction = record(value);
    if (
      !transaction ||
      (transaction.status !== "pending" &&
        transaction.status !== "success" &&
        transaction.status !== "failed")
    ) {
      return [];
    }
    const method = record(transaction.method);
    const error = record(transaction.error);
    return [{
      id: text(transaction.id) ?? `transaction-${index + 1}`,
      gatewayPaymentId: text(transaction.pg_transaction_id),
      status: transaction.status,
      amountValue: amountFromMeta(transaction.amount),
      method: text(method?.type),
      errorCode: text(error?.code),
      errorReason: text(error?.reason),
      createdAt: dateFromEpoch(transaction.created_timestamp),
      updatedAt: dateFromEpoch(transaction.updated_timestamp),
    }];
  });

  const rawRefunds = rawTransactions.flatMap((value) => {
    const transaction = record(value);
    return Array.isArray(transaction?.refunds) ? transaction.refunds : [];
  });
  const refunds: MetaPaymentRefund[] = rawRefunds.flatMap((value, index) => {
    const refund = record(value);
    if (
      !refund ||
      (refund.status !== "pending" &&
        refund.status !== "success" &&
        refund.status !== "failed")
    ) {
      return [];
    }
    const amountValue = amountFromMeta(refund.amount);
    if (amountValue === null || amountValue <= 0) return [];
    return [{
      id: text(refund.id) ?? `refund-${index + 1}`,
      amountValue,
      status: refund.status,
      speedProcessed:
        refund.speed_processed === "instant" || refund.speed_processed === "normal"
          ? refund.speed_processed
          : null,
      createdAt: dateFromEpoch(refund.created_timestamp),
    }];
  });

  return {
    ok: true,
    paymentStatus: lookup.status,
    transactions,
    refunds,
  };
}