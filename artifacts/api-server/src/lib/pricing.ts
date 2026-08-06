export interface PricingLookupInput {
  car_category?: unknown;
  category?: unknown;
  service?: unknown;
  selected_service?: unknown;
}

export interface PricingLookupResult {
  price: number | null;
  currency: "INR";
  description: string;
  car_category: string;
  service: string;
}

const PRICES: Record<string, Record<string, number>> = {
  "small cars": {
    "foam washing": 400,
    "premium washing": 600,
    "interior cleaning": 2500,
    "interior steam cleaning": 3500,
    "leather treatment": 5000,
    detailing: 5000,
    "paint sealant coating (teflon)": 6500,
    "ceramic coating – 9h": 11000,
    "ceramic coating – mafra": 12500,
    "ceramic coating – menza pro": 15000,
    "ceramic coating – koch chemie": 18000,
    "corrosion treatment": 3500,
    "windshield coating": 2500,
    "windshield coating (all glasses)": 5000,
    "sun control film – economy": 5200,
    "sun control film – standard": 7500,
    "sun control film – premium": 11500,
    "sun control film – ceramic": 13500,
  },
  "hatchback / small sedan": {
    "foam washing": 500,
    "premium washing": 700,
    "interior cleaning": 3000,
    "interior steam cleaning": 4000,
    "leather treatment": 5500,
    detailing: 6500,
    "paint sealant coating (teflon)": 8500,
    "ceramic coating – 9h": 12500,
    "ceramic coating – mafra": 15000,
    "ceramic coating – menza pro": 18000,
    "ceramic coating – koch chemie": 22000,
    "corrosion treatment": 5000,
    "windshield coating": 3000,
    "windshield coating (all glasses)": 5500,
    "sun control film – economy": 6000,
    "sun control film – standard": 8300,
    "sun control film – premium": 13000,
    "sun control film – ceramic": 15500,
  },
  "mid-size sedan / compact suv / muv": {
    "foam washing": 600,
    "premium washing": 800,
    "interior cleaning": 3500,
    "interior steam cleaning": 4500,
    "leather treatment": 6000,
    detailing: 7000,
    "paint sealant coating (teflon)": 9500,
    "ceramic coating – 9h": 15000,
    "ceramic coating – mafra": 18000,
    "ceramic coating – menza pro": 21000,
    "ceramic coating – koch chemie": 25000,
    "corrosion treatment": 6000,
    "windshield coating": 3500,
    "windshield coating (all glasses)": 6000,
    "sun control film – economy": 6500,
    "sun control film – standard": 9500,
    "sun control film – premium": 15000,
    "sun control film – ceramic": 18000,
  },
  "suv / mpv": {
    "foam washing": 700,
    "premium washing": 900,
    "interior cleaning": 4500,
    "interior steam cleaning": 5500,
    "leather treatment": 7000,
    detailing: 9000,
    "paint sealant coating (teflon)": 11500,
    "ceramic coating – 9h": 18000,
    "ceramic coating – mafra": 21000,
    "ceramic coating – menza pro": 24000,
    "ceramic coating – koch chemie": 28000,
    "corrosion treatment": 7500,
    "windshield coating": 4000,
    "windshield coating (all glasses)": 6500,
    "sun control film – economy": 8400,
    "sun control film – standard": 12500,
    "sun control film – premium": 18000,
    "sun control film – ceramic": 21000,
  },
};

const CATEGORY_ALIASES: Record<string, string> = {
  "cat-small": "small cars",
  "cat-hatch": "hatchback / small sedan",
  "cat-mid": "mid-size sedan / compact suv / muv",
  "cat-suv": "suv / mpv",
  // Short labels used by the imported chatbot's vehicle list.
  "mid-size sedan / compact": "mid-size sedan / compact suv / muv",
};

const SERVICE_ALIASES: Record<string, string> = {
  "svc-foam": "foam washing",
  "svc-premium-wash": "premium washing",
  "svc-interior-clean": "interior cleaning",
  "svc-interior-steam": "interior steam cleaning",
  "svc-leather": "leather treatment",
  "svc-detailing": "detailing",
  "svc-teflon": "paint sealant coating (teflon)",
  "svc-ceramic-9h": "ceramic coating – 9h",
  "svc-ceramic-mafra": "ceramic coating – mafra",
  "svc-ceramic-menza": "ceramic coating – menza pro",
  "svc-ceramic-koch": "ceramic coating – koch chemie",
  "svc-corrosion": "corrosion treatment",
  "svc-windshield": "windshield coating",
  "svc-windshield-all": "windshield coating (all glasses)",
  "svc-scf-economy": "sun control film – economy",
  "svc-scf-standard": "sun control film – standard",
  "svc-scf-premium": "sun control film – premium",
  "svc-scf-ceramic": "sun control film – ceramic",
  // Short labels used by the imported chatbot's coating list.
  "ceramic coating - menza": "ceramic coating – menza pro",
};

function normalize(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[—–-]/g, "-")
    .replace(/\s+/g, " ");
}

function canonicalCategory(value: unknown): string {
  const normalized = normalize(value);
  return normalize(CATEGORY_ALIASES[normalized] ?? normalized);
}

function canonicalService(value: unknown): string {
  const normalized = normalize(value);
  return normalize(SERVICE_ALIASES[normalized] ?? normalized);
}

export function resolvePricingLookup(input: PricingLookupInput): PricingLookupResult {
  const category = canonicalCategory(input.car_category ?? input.category);
  const service = canonicalService(input.service ?? input.selected_service);
  // Compare normalized keys as well as normalized input. This keeps values
  // copied from WhatsApp labels working when they use en dashes/em dashes,
  // while the price table uses a different dash character.
  const categoryPrices = Object.entries(PRICES).find(
    ([tableCategory]) => normalize(tableCategory) === category,
  )?.[1];
  const price = Object.entries(categoryPrices ?? {}).find(
    ([tableService]) => normalize(tableService) === service,
  )?.[1] ?? null;

  return {
    price,
    currency: "INR",
    description: price === null
      ? "We could not find a price for that combination. Please choose another option."
      : `${service.replace(/\b\w/g, (letter) => letter.toUpperCase())} for ${category.replace(/\b\w/g, (letter) => letter.toUpperCase())}.`,
    car_category: String(input.car_category ?? input.category ?? ""),
    service: String(input.service ?? input.selected_service ?? ""),
  };
}