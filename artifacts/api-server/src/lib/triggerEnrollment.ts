import mongoose, { type ClientSession } from "mongoose";
import { CampaignModel } from "../models/Campaign";
import { CampaignRecipientModel } from "../models/CampaignRecipient";
import { ContactModel } from "../models/Contact";
import { logger } from "./logger";

const NEW_CONTACT_EVENT = "contact_created";
const ACTIVE_TRIGGER_STATUSES = ["SCHEDULED", "SENDING", "COMPLETED"];

type EnrollmentOptions = {
  session?: ClientSession;
};

type EnrollmentResult = {
  enrolled: number;
  alreadyEnrolled: number;
};

function objectId(value: string | mongoose.Types.ObjectId) {
  return value instanceof mongoose.Types.ObjectId
    ? value
    : new mongoose.Types.ObjectId(value);
}

function isDuplicateKeyError(error: unknown) {
  return (
    (error as { code?: number }).code === 11000 ||
    (error as { writeErrors?: Array<{ code?: number }> }).writeErrors?.some(
      (writeError) => writeError.code === 11000,
    )
  );
}

/**
 * Enroll active contacts into one configured Trigger campaign.
 *
 * The unique CampaignRecipient index remains the final idempotency guard.
 * Upserts make repeated calls ordinary no-ops and the duplicate-key branch
 * handles a concurrent race on that index.
 */
export async function enrollContactsInTriggerCampaign(
  userIdValue: string | mongoose.Types.ObjectId,
  campaignIdValue: string | mongoose.Types.ObjectId,
  contactIds: Array<string | mongoose.Types.ObjectId>,
  options: EnrollmentOptions = {},
): Promise<EnrollmentResult> {
  const userId = objectId(userIdValue);
  const campaignId = objectId(campaignIdValue);
  const validContactIds = contactIds
    .filter((id) => mongoose.isValidObjectId(String(id)))
    .map((id) => objectId(id));

  const campaignQuery = CampaignModel.findOne({
    _id: campaignId,
    userId,
    type: "TRIGGER",
    status: { $in: ACTIVE_TRIGGER_STATUSES },
  });
  if (options.session) campaignQuery.session(options.session);
  const campaign = await campaignQuery.lean();
  if (!campaign || validContactIds.length === 0) {
    return { enrolled: 0, alreadyEnrolled: 0 };
  }

  const contactQuery = ContactModel.find({
    userId,
    _id: { $in: validContactIds },
    status: "active",
  }).select("_id");
  if (options.session) contactQuery.session(options.session);
  const contacts = await contactQuery.lean();
  if (contacts.length === 0) {
    return { enrolled: 0, alreadyEnrolled: 0 };
  }

  const uniqueContactIds = [...new Map(
    contacts.map((contact) => [String(contact._id), contact._id]),
  ).values()];

  try {
    const result = await CampaignRecipientModel.bulkWrite(
      uniqueContactIds.map((contactId) => ({
        updateOne: {
          filter: { userId, campaignId: campaign._id, contactId },
          update: {
            $setOnInsert: {
              userId,
              campaignId: campaign._id,
              contactId,
              status: "QUEUED",
              currentStepId: "initial",
              nextActionAt: new Date(),
            },
          },
          upsert: true,
        },
      })),
      { ordered: false, ...(options.session ? { session: options.session } : {}) },
    );
    const enrolled = result.upsertedCount ?? 0;

    if (enrolled > 0) {
      await CampaignModel.updateOne(
        { _id: campaign._id, userId },
        {
          $inc: { "stats.totalRecipients": enrolled },
          $set: { status: "SENDING" },
        },
        options.session ? { session: options.session } : undefined,
      );
    }

    return {
      enrolled,
      alreadyEnrolled: uniqueContactIds.length - enrolled,
    };
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;

    const alreadyEnrolledQuery = CampaignRecipientModel.countDocuments({
      userId,
      campaignId: campaign._id,
      contactId: { $in: uniqueContactIds },
    });
    if (options.session) alreadyEnrolledQuery.session(options.session);
    const alreadyEnrolled = await alreadyEnrolledQuery;
    return { enrolled: 0, alreadyEnrolled };
  }
}

/**
 * Enroll a newly created contact into every active tenant Trigger campaign
 * configured for the contact-created event.
 *
 * Enrollment is intentionally best-effort: failure to add a campaign
 * recipient must not turn a successful contact creation into a failed request.
 */
export async function enrollNewContactInTriggerCampaigns(
  userIdValue: string | mongoose.Types.ObjectId,
  contactId: string | mongoose.Types.ObjectId,
  options: EnrollmentOptions = {},
) {
  const userId = objectId(userIdValue);
  let campaigns: Array<{ _id: mongoose.Types.ObjectId }> = [];
  try {
    const campaignQuery = CampaignModel.find({
      userId,
      type: "TRIGGER",
      status: { $in: ACTIVE_TRIGGER_STATUSES },
      "trigger.event": NEW_CONTACT_EVENT,
    }).select("_id");
    if (options.session) campaignQuery.session(options.session);
    campaigns = await campaignQuery.lean() as Array<{ _id: mongoose.Types.ObjectId }>;
  } catch (error) {
    logger.error(
      { err: error, userId: String(userId), contactId: String(contactId) },
      "Unable to find active Trigger campaigns for new contact",
    );
    return { enrolled: 0, alreadyEnrolled: 0 };
  }

  let enrolled = 0;
  let alreadyEnrolled = 0;
  for (const campaign of campaigns) {
    try {
      const result = await enrollContactsInTriggerCampaign(
        userId,
        campaign._id as mongoose.Types.ObjectId,
        [contactId],
        options,
      );
      enrolled += result.enrolled;
      alreadyEnrolled += result.alreadyEnrolled;
    } catch (error) {
      logger.error(
        {
          err: error,
          userId: String(userId),
          contactId: String(contactId),
          campaignId: String(campaign._id),
        },
        "Automatic Trigger enrollment failed",
      );
    }
  }

  return { enrolled, alreadyEnrolled };
}

export async function enrollNewContactsInTriggerCampaigns(
  userIdValue: string | mongoose.Types.ObjectId,
  contactIds: Array<string | mongoose.Types.ObjectId>,
  options: EnrollmentOptions = {},
) {
  for (const contactId of contactIds) {
    await enrollNewContactInTriggerCampaigns(userIdValue, contactId, options);
  }
}