import { Router } from "express";
import mongoose from "mongoose";
import multer from "multer";
import { ServicePricingCatalogModel } from "../models/ServicePricingCatalog";
import { authenticate, type AuthRequest } from "../middlewares/authenticate";
import { parsePricingWorkbook } from "../lib/xlsxPricingParser";
import { ensurePricingCatalog } from "../lib/pricing";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

function userId(req: AuthRequest) {
  return new mongoose.Types.ObjectId(req.user!.userId);
}

function shapeCatalog(catalog: Record<string, unknown> | null) {
  return {
    rows: ((catalog?.rows as Array<Record<string, unknown>> | undefined) ?? []).map((row) => ({
      ...row,
      id: String(row._id ?? ""),
    })),
    sourceFilename: catalog?.sourceFilename ?? null,
    importedAt: catalog?.importedAt ?? null,
    updatedAt: catalog?.updatedAt ?? null,
  };
}

router.get("/service-pricing", authenticate, async (req: AuthRequest, res) => {
  try {
    const catalog = await ensurePricingCatalog(userId(req));
    res.json({ catalog: shapeCatalog(catalog.toObject() as Record<string, unknown>) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unable to load service pricing" });
  }
});

router.post("/service-pricing/import", authenticate, upload.single("file"), async (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "An .xlsx pricing workbook is required" });
      return;
    }
    const rows = parsePricingWorkbook(req.file.buffer);
    const catalog = await ServicePricingCatalogModel.findOneAndUpdate(
      { userId: userId(req) },
      { $set: { rows, sourceFilename: req.file.originalname, importedAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
    res.json({ catalog: shapeCatalog(catalog as Record<string, unknown>) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Unable to import pricing workbook" });
  }
});

router.put("/service-pricing", authenticate, async (req: AuthRequest, res) => {
  try {
    const rows = (req.body as { rows?: Array<{ service?: string; category?: string; price?: number; currency?: string }> }).rows;
    if (!Array.isArray(rows)) {
      res.status(400).json({ error: "rows must be an array" });
      return;
    }
    const cleanRows = rows.map((row) => ({
      service: String(row.service ?? "").trim(),
      category: String(row.category ?? "").trim(),
      price: Number(row.price),
      currency: String(row.currency ?? "INR").trim() || "INR",
    }));
    if (cleanRows.some((row) => !row.service || !row.category || !Number.isFinite(row.price) || row.price < 0)) {
      res.status(400).json({ error: "Every row needs a service, category, and non-negative price" });
      return;
    }
    const catalog = await ServicePricingCatalogModel.findOneAndUpdate(
      { userId: userId(req) },
      { $set: { rows: cleanRows, sourceFilename: "Edited in Service Pricing", importedAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
    res.json({ catalog: shapeCatalog(catalog as Record<string, unknown>) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Unable to save service pricing" });
  }
});

export default router;