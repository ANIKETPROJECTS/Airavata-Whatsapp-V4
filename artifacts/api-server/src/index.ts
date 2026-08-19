import app from "./app";
import { logger } from "./lib/logger";
import { connectToDatabase } from "./lib/mongodb";
import { CreditSettingModel } from "./models/CreditSetting";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

connectToDatabase()
  .then(() => {
    return CreditSettingModel.updateOne(
      { key: "creditsPerMessage" },
      { $setOnInsert: { value: 1 } },
      { upsert: true },
    );
  })
  .then(() => {
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }

      logger.info({ port }, "Server listening");
    });
  })
  .catch((err) => {
    logger.error({ err }, "Failed to start server due to database connection error");
    process.exit(1);
  });
