import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import apiKeysRouter from "./apikeys";
import contactsRouter from "./contacts";
import groupsRouter from "./groups";
import tagsRouter from "./tags";
import templatesRouter from "./templates";
import webhookRouter from "./webhook";
import conversationsRouter from "./conversations";
import campaignsRouter from "./campaigns";
import billingRouter from "./billing";
import phoneNumbersRouter from "./phonenumbers";
import metaComplianceRouter from "./meta-compliance";

const router: IRouter = Router();

// These routers MUST come first — they have no auth and must not be intercepted.
router.use(webhookRouter);
router.use(metaComplianceRouter);

router.use(healthRouter);
router.use(authRouter);
router.use(apiKeysRouter);
router.use(contactsRouter);
router.use(groupsRouter);
router.use(tagsRouter);
router.use(templatesRouter);
router.use(conversationsRouter);
router.use(campaignsRouter);
router.use(billingRouter);
router.use(phoneNumbersRouter);

export default router;
