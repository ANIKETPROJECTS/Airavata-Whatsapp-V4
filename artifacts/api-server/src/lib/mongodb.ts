import mongoose from "mongoose";
import { logger } from "./logger";

const MONGODB_URI = process.env["MONGODB_URI"];

if (!MONGODB_URI) {
  throw new Error(
    "MONGODB_URI environment variable is required but was not provided.",
  );
}

mongoose.set("strictQuery", true);

let connectPromise: Promise<typeof mongoose> | null = null;

/**
 * Connects to MongoDB (idempotent - safe to call multiple times, e.g. once
 * at server startup). Reuses the same connection promise on subsequent calls.
 */
export function connectToDatabase(): Promise<typeof mongoose> {
  if (!connectPromise) {
    connectPromise = mongoose
      .connect(MONGODB_URI as string)
      .then((instance) => {
        logger.info(
          {
            mongoHost: instance.connection.host,
            mongoDatabase: instance.connection.name,
          },
          "Connected to MongoDB",
        );
        return instance;
      })
      .catch((err) => {
        // Allow a future call to retry instead of caching a failed connection.
        connectPromise = null;
        logger.error({ err }, "Failed to connect to MongoDB");
        throw err;
      });
  }

  return connectPromise;
}

/**
 * Current mongoose connection ready state as a human-readable string.
 * 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting.
 */
export function getConnectionState(): string {
  const states = ["disconnected", "connected", "connecting", "disconnecting"];
  return states[mongoose.connection.readyState] ?? "unknown";
}

export { mongoose };
