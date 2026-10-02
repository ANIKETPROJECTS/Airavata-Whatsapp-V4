import mongoose from "mongoose";
import { ChatbotExecutionModel } from "../models/ChatbotExecution";

export interface ChatbotExecutionStats {
  triggered: number;
  completed: number;
  active: number;
  interrupted: number;
  stopped: number;
  failed: number;
}

const EMPTY_STATS: ChatbotExecutionStats = {
  triggered: 0,
  completed: 0,
  active: 0,
  interrupted: 0,
  stopped: 0,
  failed: 0,
};

export async function getChatbotExecutionStats(
  userId: mongoose.Types.ObjectId,
  flowIds: mongoose.Types.ObjectId[],
): Promise<Map<string, ChatbotExecutionStats>> {
  const statsByFlow = new Map<string, ChatbotExecutionStats>();
  if (flowIds.length === 0) return statsByFlow;

  const rows = await ChatbotExecutionModel.aggregate<{
    _id: mongoose.Types.ObjectId;
    triggered: number;
    completed: number;
    active: number;
    interrupted: number;
    stopped: number;
    failed: number;
  }>([
    { $match: { userId, flowId: { $in: flowIds } } },
    {
      $group: {
        _id: "$flowId",
        triggered: { $sum: 1 },
        completed: { $sum: { $cond: [{ $eq: ["$status", "COMPLETED"] }, 1, 0] } },
        active: { $sum: { $cond: [{ $eq: ["$status", "ACTIVE"] }, 1, 0] } },
        interrupted: { $sum: { $cond: [{ $eq: ["$status", "INTERRUPTED"] }, 1, 0] } },
        stopped: { $sum: { $cond: [{ $eq: ["$status", "STOPPED"] }, 1, 0] } },
        failed: { $sum: { $cond: [{ $eq: ["$status", "FAILED"] }, 1, 0] } },
      },
    },
  ]);

  for (const row of rows) {
    statsByFlow.set(String(row._id), {
      triggered: row.triggered ?? 0,
      completed: row.completed ?? 0,
      active: row.active ?? 0,
      interrupted: row.interrupted ?? 0,
      stopped: row.stopped ?? 0,
      failed: row.failed ?? 0,
    });
  }

  return statsByFlow;
}

export function mergeChatbotExecutionStats(
  stored: { triggered?: number; completed?: number } | null | undefined,
  current: ChatbotExecutionStats | undefined,
): ChatbotExecutionStats {
  const stats = current ?? EMPTY_STATS;
  return {
    ...stats,
    // Keep any pre-history lifetime counts while correcting counters from
    // actual run records whenever those records provide a higher value.
    triggered: Math.max(stored?.triggered ?? 0, stats.triggered),
    completed: Math.max(stored?.completed ?? 0, stats.completed),
  };
}