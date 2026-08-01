/**
 * Seed script: creates the "Product Promotion Flow" demo chatbot flow
 * in MongoDB for the first user found in the database.
 *
 * Usage:  node scripts/seed-demo-flow.mjs
 */

import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("❌  MONGODB_URI environment variable is not set.");
  process.exit(1);
}

// ── Schemas (mirrors artifacts/api-server/src/models/) ─────────────────────

const nodeSchema = new mongoose.Schema(
  { id: String, type: String, position: { x: Number, y: Number }, data: mongoose.Schema.Types.Mixed },
  { _id: false },
);
const edgeSchema = new mongoose.Schema(
  { id: String, source: String, target: String, sourceHandle: String, targetHandle: String, label: String, animated: Boolean },
  { _id: false },
);
const chatbotFlowSchema = new mongoose.Schema(
  {
    userId:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name:     { type: String, required: true },
    status:   { type: String, enum: ["DRAFT", "PUBLISHED"], default: "DRAFT" },
    nodes:    [nodeSchema],
    edges:    [edgeSchema],
    version:  { type: Number, default: 1 },
    history:  { type: Array, default: [] },
    variables:{ type: Array, default: [] },
    analytics:{ triggered: { type: Number, default: 0 }, completed: { type: Number, default: 0 } },
  },
  { timestamps: true },
);
const userSchema = new mongoose.Schema({ email: String }, { strict: false });

const ChatbotFlow = mongoose.models.ChatbotFlow ?? mongoose.model("ChatbotFlow", chatbotFlowSchema);
const User        = mongoose.models.User        ?? mongoose.model("User",        userSchema);

// ── Flow definition ────────────────────────────────────────────────────────

const NODES = [
  // ── Trigger ──────────────────────────────────────────────────────────────
  {
    id: "n-start",
    type: "start",
    position: { x: 400, y: 50 },
    data: { label: "Start", description: "Triggered when customer taps Interested / Buy Now on template" },
  },

  // ── Opening messages ─────────────────────────────────────────────────────
  {
    id: "n-greet",
    type: "textReply",
    position: { x: 400, y: 200 },
    data: {
      message: "👋 Hi {{customer_name}},\nThank you for your interest in our products.",
      typingDelay: 1,
    },
  },
  {
    id: "n-help",
    type: "textReply",
    position: { x: 400, y: 370 },
    data: { message: "How can I help you today?", typingDelay: 1 },
  },

  // ── Main menu ────────────────────────────────────────────────────────────
  {
    id: "n-list",
    type: "listReply",
    position: { x: 400, y: 520 },
    data: {
      header: "Product Promotion",
      body: "Please choose an option below:",
      footer: "Powered by Airavata",
      buttonText: "Choose an option",
      sections: [
        {
          title: "What would you like to do?",
          rows: [
            { id: "vp",      title: "View Products", description: "Browse our featured products" },
            { id: "pricing", title: "Pricing",        description: "See our latest pricing" },
            { id: "buy",     title: "Buy Now",        description: "Proceed to purchase" },
            { id: "sales",   title: "Talk to Sales",  description: "Connect with our sales team" },
          ],
        },
      ],
    },
  },

  // ── View Products branch ─────────────────────────────────────────────────
  {
    id: "n-vp-text",
    type: "textReply",
    position: { x: -200, y: 730 },
    data: { message: "Here are our featured products.", typingDelay: 1 },
  },
  {
    id: "n-vp-media1",
    type: "mediaReply",
    position: { x: -200, y: 880 },
    data: {
      mediaType: "image",
      mediaUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800",
      caption: "🕐 *Product 1 — Premium Watch*\nElegant design for every occasion.\n💰 Price: $149",
    },
  },
  {
    id: "n-vp-media2",
    type: "mediaReply",
    position: { x: -200, y: 1030 },
    data: {
      mediaType: "image",
      mediaUrl: "https://images.unsplash.com/photo-1585386959984-a4155224a1ad?w=800",
      caption: "💄 *Product 2 — Luxury Perfume*\nExquisite fragrance, long-lasting.\n💰 Price: $89",
    },
  },
  {
    id: "n-vp-media3",
    type: "mediaReply",
    position: { x: -200, y: 1180 },
    data: {
      mediaType: "image",
      mediaUrl: "https://images.unsplash.com/photo-1491553895911-0055eca6402d?w=800",
      caption: "👟 *Product 3 — Sport Shoes*\nComfort and style combined.\n💰 Price: $119",
    },
  },
  {
    id: "n-vp-cta",
    type: "ctaButton",
    position: { x: -200, y: 1330 },
    data: {
      body: "Explore all our products on our website and place your order!",
      footer: "Secure checkout",
      buttons: [{ id: "website", title: "Visit Website" }],
    },
  },

  // ── Pricing branch ───────────────────────────────────────────────────────
  {
    id: "n-price-text1",
    type: "textReply",
    position: { x: 400, y: 730 },
    data: { message: "Our latest pricing is shown below.", typingDelay: 1 },
  },
  {
    id: "n-price-text2",
    type: "textReply",
    position: { x: 400, y: 880 },
    data: {
      message:
        "💼 *Our Pricing Plans*\n\n🔹 *Starter* — $29/month\n   Up to 500 contacts\n\n🔹 *Growth* — $79/month\n   Up to 5,000 contacts\n\n🔹 *Pro* — $149/month\n   Unlimited contacts + priority support\n\nAll plans include a 14-day free trial! 🎉",
      typingDelay: 1,
    },
  },
  {
    id: "n-price-cta",
    type: "ctaButton",
    position: { x: 400, y: 1030 },
    data: {
      body: "Visit our website to get started with the plan that fits you best.",
      footer: "14-day free trial",
      buttons: [{ id: "website", title: "Visit Website" }],
    },
  },

  // ── Buy Now branch ───────────────────────────────────────────────────────
  {
    id: "n-buy-text",
    type: "textReply",
    position: { x: 900, y: 730 },
    data: { message: "Great! Click below to continue to our checkout page.", typingDelay: 1 },
  },
  {
    id: "n-buy-cta",
    type: "ctaButton",
    position: { x: 900, y: 880 },
    data: {
      body: "You are just one click away from placing your order! 🛒",
      footer: "Secure & fast checkout",
      buttons: [{ id: "website", title: "Visit Website" }],
    },
  },

  // ── Talk to Sales branch ─────────────────────────────────────────────────
  {
    id: "n-sales-text",
    type: "textReply",
    position: { x: 1350, y: 730 },
    data: {
      message:
        "Our sales team will contact you shortly. 📞\n\nExpect a call or message within 24 hours. Thank you for your interest!",
      typingDelay: 1,
    },
  },

  // ── Post-CTA thank-you (shared by View Products, Pricing, Buy Now) ────────
  {
    id: "n-thanks1",
    type: "textReply",
    position: { x: 400, y: 1500 },
    data: {
      message:
        "Thank you for visiting our website. 🌐\n\nComplete the demo purchase to place your dummy order.",
      typingDelay: 1,
    },
  },
  {
    id: "n-thanks2",
    type: "textReply",
    position: { x: 400, y: 1650 },
    data: {
      message:
        "🎉 Your demo order has been placed successfully.\n\nThank you for choosing us!",
      typingDelay: 1,
    },
  },
];

const EDGES = [
  // ── Opening ───────────────────────────────────────────────────────────────
  { id: "e-start-greet",      source: "n-start",      target: "n-greet" },
  { id: "e-greet-help",       source: "n-greet",       target: "n-help" },
  { id: "e-help-list",        source: "n-help",        target: "n-list" },

  // ── List → branches ───────────────────────────────────────────────────────
  { id: "e-list-vp",          source: "n-list",        target: "n-vp-text",     sourceHandle: "vp" },
  { id: "e-list-pricing",     source: "n-list",        target: "n-price-text1", sourceHandle: "pricing" },
  { id: "e-list-buy",         source: "n-list",        target: "n-buy-text",    sourceHandle: "buy" },
  { id: "e-list-sales",       source: "n-list",        target: "n-sales-text",  sourceHandle: "sales" },

  // ── View Products ─────────────────────────────────────────────────────────
  { id: "e-vp-text-m1",       source: "n-vp-text",     target: "n-vp-media1" },
  { id: "e-vp-m1-m2",         source: "n-vp-media1",   target: "n-vp-media2" },
  { id: "e-vp-m2-m3",         source: "n-vp-media2",   target: "n-vp-media3" },
  { id: "e-vp-m3-cta",        source: "n-vp-media3",   target: "n-vp-cta" },
  { id: "e-vp-cta-thanks",    source: "n-vp-cta",      target: "n-thanks1",     sourceHandle: "website" },

  // ── Pricing ───────────────────────────────────────────────────────────────
  { id: "e-price1-price2",    source: "n-price-text1", target: "n-price-text2" },
  { id: "e-price2-cta",       source: "n-price-text2", target: "n-price-cta" },
  { id: "e-price-cta-thanks", source: "n-price-cta",   target: "n-thanks1",     sourceHandle: "website" },

  // ── Buy Now ───────────────────────────────────────────────────────────────
  { id: "e-buy-text-cta",     source: "n-buy-text",    target: "n-buy-cta" },
  { id: "e-buy-cta-thanks",   source: "n-buy-cta",     target: "n-thanks1",     sourceHandle: "website" },

  // ── Post-CTA thank-you ────────────────────────────────────────────────────
  { id: "e-thanks1-thanks2",  source: "n-thanks1",     target: "n-thanks2" },
];

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔌  Connecting to MongoDB…");
  await mongoose.connect(MONGODB_URI);
  console.log("✅  Connected.");

  // Find the first user to attach the flow to
  const user = await User.findOne({}).sort({ createdAt: 1 }).lean();
  if (!user) {
    console.error("❌  No users found in the database. Please create an account first, then re-run this script.");
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log(`👤  Using user: ${user.email} (${user._id})`);

  // Remove any existing flow with this name for this user (idempotent re-runs)
  const existing = await ChatbotFlow.deleteMany({ userId: user._id, name: "Product Promotion Flow" });
  if (existing.deletedCount > 0) {
    console.log(`🗑️   Removed ${existing.deletedCount} existing "Product Promotion Flow" document(s).`);
  }

  // Create the flow
  const flow = await ChatbotFlow.create({
    userId: user._id,
    name: "Product Promotion Flow",
    status: "PUBLISHED",
    nodes: NODES,
    edges: EDGES,
    version: 1,
    history: [],
    variables: [],
    analytics: { triggered: 0, completed: 0 },
  });

  console.log(`\n🎉  Flow created successfully!`);
  console.log(`    ID     : ${flow._id}`);
  console.log(`    Name   : ${flow.name}`);
  console.log(`    Status : ${flow.status}`);
  console.log(`    Nodes  : ${flow.nodes.length}`);
  console.log(`    Edges  : ${flow.edges.length}`);
  console.log(`\n📋  Next step: open the Chatbot Builder in the app, find "Product Promotion Flow",`);
  console.log(`    then link it to your WhatsApp template's quick-reply button.`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("❌  Seed failed:", err);
  process.exit(1);
});
