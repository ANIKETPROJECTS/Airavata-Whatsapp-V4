import { Router } from "express";
import { authenticate, type AuthRequest } from "../middlewares/authenticate";
import { UserModel } from "../models/User";
import { getMetaBillingInsights } from "../lib/whatsapp";
import { logger } from "../lib/logger";

const router = Router();

router.get("/meta/billing-insights", authenticate, async (req: AuthRequest, res) => {
  try {
    const rawRange = String(req.query.range ?? "7");
    if (rawRange !== "7" && rawRange !== "30") {
      res.status(400).json({ error: "range must be 7 or 30 days" });
      return;
    }

    const user = await UserModel.findById(req.user!.userId)
      .select("billingMode")
      .lean();
    if (!user || user.billingMode !== "meta_direct") {
      res.status(403).json({ error: "Meta billing insights are not available for this account" });
      return;
    }

    const insights = await getMetaBillingInsights(
      String(req.user!.userId),
      rawRange === "30" ? 30 : 7,
    );
    res.json({ insights });
  } catch (error) {
    logger.error({ err: error, userId: req.user!.userId }, "GET /meta/billing-insights failed");
    res.status(502).json({
      error: error instanceof Error ? error.message : "Unable to load Meta billing insights",
    });
  }
});

export default router;