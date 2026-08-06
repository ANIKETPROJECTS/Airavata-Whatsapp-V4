import { Schema, model, type InferSchemaType } from "mongoose";

const pricingRowSchema = new Schema(
  {
    service: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "INR", trim: true },
    description: { type: String, trim: true },
  },
  { _id: true },
);

const servicePricingCatalogSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    rows: { type: [pricingRowSchema], default: [] },
    sourceFilename: { type: String, trim: true },
    importedAt: { type: Date },
  },
  { timestamps: true },
);

export type ServicePricingRow = InferSchemaType<typeof pricingRowSchema>;
export type ServicePricingCatalog = InferSchemaType<typeof servicePricingCatalogSchema>;
export const ServicePricingCatalogModel = model("ServicePricingCatalog", servicePricingCatalogSchema);