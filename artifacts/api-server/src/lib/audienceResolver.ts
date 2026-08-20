import mongoose from "mongoose";
import { ContactModel } from "../models/Contact";
import { AudienceSegmentModel } from "../models/AudienceSegment";

export type AudienceFilter =
  | { op: "AND" | "OR"; filters: AudienceFilter[] }
  | { field: "tag"; value: string }
  | { field: "group"; value: string }
  | { field: "status"; value: "active" | "blocked" | "unsubscribed" }
  | { field: "attribute"; key: string; value: string | number | boolean };

export type AudienceInput = {
  contactIds?: string[];
  groupIds?: string[];
  tagIds?: string[];
  segmentId?: string;
  filter?: AudienceFilter;
};

function ids(values: string[] = []) {
  return values
    .filter((value) => mongoose.isValidObjectId(value))
    .map((value) => new mongoose.Types.ObjectId(value));
}

function filterQuery(filter: AudienceFilter): Record<string, unknown> {
  if ("op" in filter) {
    const clauses = filter.filters.map(filterQuery);
    return filter.op === "AND" ? { $and: clauses } : { $or: clauses };
  }

  if (filter.field === "tag") return { tags: new mongoose.Types.ObjectId(filter.value) };
  if (filter.field === "group") {
    const groupId = new mongoose.Types.ObjectId(filter.value);
    return { $or: [{ groupId }, { groupIds: groupId }] };
  }
  if (filter.field === "status") return { status: filter.value };
  return { [`attributes.${filter.key}`]: filter.value };
}

/**
 * Resolve a campaign audience once at enrollment time. The final status/DND
 * check is repeated by CampaignExecutor immediately before every send.
 */
export async function resolveAudience(
  userId: mongoose.Types.ObjectId | string,
  input: AudienceInput,
) {
  const owner = new mongoose.Types.ObjectId(String(userId));
  const segment = input.segmentId && mongoose.isValidObjectId(input.segmentId)
    ? await AudienceSegmentModel.findOne({ _id: input.segmentId, userId: owner }).lean()
    : null;
  const filter = input.filter ?? segment?.filter as AudienceFilter | undefined;

  const clauses: Record<string, unknown>[] = [{ userId: owner }];
  const explicitIds = ids(input.contactIds);
  if (explicitIds.length) clauses.push({ _id: { $in: explicitIds } });

  const groupIds = ids(input.groupIds);
  if (groupIds.length) {
    clauses.push({ $or: [{ groupId: { $in: groupIds } }, { groupIds: { $in: groupIds } }] });
  }

  const tagIds = ids(input.tagIds);
  if (tagIds.length) clauses.push({ tags: { $in: tagIds } });
  if (filter) clauses.push(filterQuery(filter));

  return ContactModel.find({ $and: clauses })
    .select("_id name phone email attributes tags groupId groupIds status")
    .lean();
}