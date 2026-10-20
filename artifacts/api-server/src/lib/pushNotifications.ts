import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import mongoose from "mongoose";
import { PushDeviceModel } from "../models/PushDevice";
import { runWithTenant } from "./tenantDatabase";

type IncomingReplyPush = {
  tenantUserId: string;
  messageId: string;
  contactId: string;
  contactName: string;
  preview: string;
};

function getFirebaseMessaging() {
  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!rawServiceAccount) {
    if (!missingCredentialWarned) {
      console.warn("FCM push delivery is disabled: FIREBASE_SERVICE_ACCOUNT_JSON is not configured");
      missingCredentialWarned = true;
    }
    return null;
  }

  const existing = getApps().find((app) => app.name === "airavata-push");
  if (existing) return getMessaging(existing);

  const serviceAccount = JSON.parse(rawServiceAccount);
  const app = initializeApp(
    {
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id,
    },
    "airavata-push",
  );
  return getMessaging(app);
}

let missingCredentialWarned = false;

export async function sendIncomingReplyPush(input: IncomingReplyPush) {
  const messaging = getFirebaseMessaging();
  if (!messaging) return;

  const devices = await runWithTenant(input.tenantUserId, () =>
    PushDeviceModel.find({ userId: new mongoose.Types.ObjectId(input.tenantUserId) })
      .select("token")
      .lean(),
  );
  const tokens = [...new Set(devices.map((device) => device.token).filter(Boolean))];
  if (!tokens.length) return;

  const response = await messaging.sendEachForMulticast({
    tokens,
    notification: {
      title: input.contactName || "New WhatsApp message",
      body: input.preview || "A customer sent a new message.",
    },
    data: {
      type: "INBOUND_MESSAGE",
      messageId: input.messageId,
      contactId: input.contactId,
    },
    android: {
      priority: "high",
      notification: { channelId: "customer-replies", sound: "default" },
    },
  });

  const invalidTokens = response.responses.flatMap((result, index) => {
    const code = result.error?.code;
    return code === "messaging/invalid-registration-token" ||
      code === "messaging/registration-token-not-registered"
      ? [tokens[index]]
      : [];
  });

  if (invalidTokens.length) {
    await runWithTenant(input.tenantUserId, () =>
      PushDeviceModel.deleteMany({
        userId: new mongoose.Types.ObjectId(input.tenantUserId),
        token: { $in: invalidTokens },
      }),
    );
  }
}
