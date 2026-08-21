import app from "./app";
import { logger } from "./lib/logger";
import { connectToDatabase } from "./lib/mongodb";
import { CreditSettingModel } from "./models/CreditSetting";
import { startCampaignWorker } from "./lib/campaignWorker";
import { migrateAllExistingUsers } from "./lib/tenantMigration";

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
    return CreditSettingModel.findOne({ key: "messageRates" }).then(async (setting) => {
      if (!setting) {
        const legacy = await CreditSettingModel.findOne({ key: "creditsPerMessage" }).lean();
        const legacyRate =
          legacy && Number.isInteger((legacy as { value?: number }).value)
            ? (legacy as { value: number }).value
            : 1;
        await CreditSettingModel.create({
          key: "messageRates",
          authenticationRate: legacyRate,
          utilityRate: legacyRate,
          marketingRate: 3,
        });
      } else {
        const updates: Record<string, number> = {};
        if (!Number.isInteger(setting.authenticationRate) || setting.authenticationRate < 1) updates.authenticationRate = 1;
        if (!Number.isInteger(setting.utilityRate) || setting.utilityRate < 1) updates.utilityRate = 1;
        if (!Number.isInteger(setting.marketingRate) || setting.marketingRate < 1) updates.marketingRate = 3;
        if (Object.keys(updates).length > 0) await CreditSettingModel.updateOne({ _id: setting._id }, { $set: updates });
      }
      await CreditSettingModel.deleteMany({ key: "creditsPerMessage" });
    });
  })
  .then(() => {
    return migrateAllExistingUsers();
  })
  .then((migrationReport) => {
    logger.info(
      {
        totalUsers: migrationReport.totalUsers,
        verifiedUsers: migrationReport.verifiedUsers,
      },
      "Tenant database migration check completed",
    );
  })
  .then(() => {
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }

      logger.info({ port }, "Server listening");
      startCampaignWorker();
    });
  })
  .catch((err) => {
    logger.error({ err }, "Failed to start server due to database connection error");
    process.exit(1);
  });
