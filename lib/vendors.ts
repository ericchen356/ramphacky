// Hardcoded NYC vendor catalog. Floors are HIDDEN — only the vendor agent + code guards may read them.
import type { Category, Vendor } from "./types";

export const VENDORS: Vendor[] = [
  // ───────────────────────────── Venues (flat) ─────────────────────────────
  {
    id: "venue_skyline_terrace",
    name: "Skyline Terrace",
    category: "venue",
    city: "New York, NY",
    emoji: "🌆",
    tagline: "Midtown rooftop with 360° Manhattan skyline views",
    rating: 4.8,
    capacity: 220,
    dietaryCapabilities: [],
    pricing: { unit: "flat", list: 30000, floor: 26400 },
    style: "premium",
    persona:
      "You are Victoria Hale, events director at Skyline Terrace, the most photographed rooftop in Midtown. You are polished, confident and a little aloof — you sell exclusivity, not discounts, and you remind people that Thursdays in October book out fast. You concede only small amounts and prefer adding a perk over cutting price.",
    perks: [
      "Welcome champagne toast for all guests",
      "Private sunset photo session on the terrace",
      "Complimentary valet for 10 VIP cars",
    ],
  },
  {
    id: "venue_greenpoint_foundry",
    name: "Greenpoint Foundry Loft",
    category: "venue",
    city: "Brooklyn, NY",
    emoji: "🏭",
    tagline: "Converted 1890s iron foundry with soaring timber ceilings",
    rating: 4.6,
    capacity: 180,
    dietaryCapabilities: [],
    pricing: { unit: "flat", list: 22000, floor: 15400 },
    style: "flexible",
    persona:
      "You are Marco Ruiz, the laid-back owner-operator of Greenpoint Foundry Loft. You genuinely want the booking and love making deals work — you happily trade perks like a free AV hookup or extended hours to close. You're warm, casual, and use first names.",
    perks: [
      "Free house AV hookup (projector + 2 wireless mics)",
      "Extended hours until 1am at no charge",
      "Complimentary coat check staff",
    ],
  },
  {
    id: "venue_chelsea_gallery",
    name: "Gallery 21 Chelsea",
    category: "venue",
    city: "New York, NY",
    emoji: "🖼️",
    tagline: "Intimate white-box art gallery on West 21st",
    rating: 4.5,
    capacity: 80,
    dietaryCapabilities: [],
    pricing: { unit: "flat", list: 12000, floor: 8650 },
    style: "budget",
    persona:
      "You are Priya Shah, gallery manager at Gallery 21 Chelsea. You're friendly and practical, used to booking cocktail receptions, and fairly open to negotiation on weeknights. You keep things brief and upbeat.",
    perks: [
      "Current art exhibition stays up as backdrop",
      "Free one-hour load-in before the event",
    ],
  },
  {
    id: "venue_hudson_hall",
    name: "Hudson Yards Hall",
    category: "venue",
    city: "New York, NY",
    emoji: "🏛️",
    tagline: "Grand event hall steps from the High Line, up to 300 guests",
    rating: 4.4,
    capacity: 300,
    dietaryCapabilities: [],
    pricing: { unit: "flat", list: 18500, floor: 15700 },
    style: "stubborn",
    persona:
      "You are Doug Kowalski, a 25-year veteran sales manager at Hudson Yards Hall. You're gruff, by-the-book and quote 'policy' a lot; you hate haggling and move in small, grudging steps. You'll throw in logistics perks before you'll move much on price.",
    perks: [
      "Free tables, chairs and linens package",
      "Dedicated on-site event captain",
      "Early 2-hour setup access",
    ],
  },

  // ───────────────────────────── Catering (per person) ─────────────────────────────
  {
    id: "catering_five_boroughs",
    name: "Five Boroughs Feast",
    category: "catering",
    city: "New York, NY",
    emoji: "🍽️",
    tagline: "Every cuisine of NYC — fully certified kosher & halal kitchens",
    rating: 4.7,
    dietaryCapabilities: ["vegetarian", "vegan", "glutenFree", "nutAllergy", "halal", "kosher"],
    pricing: { unit: "per_person", list: 95, floor: 70 },
    style: "flexible",
    persona:
      "You are Tasha Greene, catering sales lead at Five Boroughs Feast. You're energetic, accommodating, and proud you can handle literally every dietary need under one roof. You like to close deals quickly and will sweeten the menu to get there.",
    perks: [
      "Free late-night slider & dessert station",
      "Complimentary menu tasting for 4",
      "Allergen-labelled cards on every dish",
    ],
  },
  {
    id: "catering_smokestack_bbq",
    name: "Smokestack BBQ Co.",
    category: "catering",
    city: "Brooklyn, NY",
    emoji: "🍖",
    tagline: "Texas-style smoked brisket, family-style trays",
    rating: 4.3,
    dietaryCapabilities: ["vegetarian"],
    pricing: { unit: "per_person", list: 55, floor: 40 },
    style: "budget",
    persona:
      "You are Big Ray Thompson, owner of Smokestack BBQ Co. You're folksy, upbeat and value-focused — 'good food, fair price'. You can do a veggie option but your kitchen is full of flour and pecans, so you can't promise gluten-free or nut-free.",
    perks: [
      "Free cornbread & mac-and-cheese upgrade",
      "Complimentary sweet tea & lemonade bar",
    ],
  },
  {
    id: "catering_maison_ardoise",
    name: "Maison Ardoise",
    category: "catering",
    city: "New York, NY",
    emoji: "🥂",
    tagline: "Michelin-trained French catering with white-glove service",
    rating: 4.9,
    dietaryCapabilities: ["vegetarian", "vegan", "glutenFree", "nutAllergy"],
    pricing: { unit: "per_person", list: 140, floor: 120 },
    style: "premium",
    persona:
      "You are Céline Moreau, director of private events at Maison Ardoise. You are elegant, precise and gently condescending about 'budget caterers'. You defend the price fiercely and prefer to add a course or service touch rather than discount.",
    perks: [
      "Complimentary passed canapé hour",
      "Sommelier-led wine pairing consultation",
      "Upgraded plated dessert course",
    ],
  },
  {
    id: "catering_saffron_sumac",
    name: "Saffron & Sumac",
    category: "catering",
    city: "Queens, NY",
    emoji: "🧆",
    tagline: "Modern Levantine mezze, halal-certified",
    rating: 4.6,
    dietaryCapabilities: ["vegetarian", "vegan", "glutenFree", "nutAllergy", "halal"],
    pricing: { unit: "per_person", list: 82, floor: 69 },
    style: "stubborn",
    persona:
      "You are Omar Haddad, co-owner of Saffron & Sumac. You're hospitable but firm — you talk about the quality of your ingredients and the hours your team spends on fresh mezze, and you move on price only reluctantly in small steps.",
    perks: [
      "Free fresh mint lemonade station",
      "Complimentary baklava dessert platter",
    ],
  },

  // ───────────────────────────── AV (flat) ─────────────────────────────
  {
    id: "av_pixelpush",
    name: "PixelPush AV",
    category: "av",
    city: "New York, NY",
    emoji: "🎛️",
    tagline: "No-frills projectors, mics and sound for corporate events",
    rating: 4.2,
    dietaryCapabilities: [],
    pricing: { unit: "flat", list: 3500, floor: 2350 },
    style: "budget",
    persona:
      "You are Kevin Liu, who runs PixelPush AV out of a van and a Queens warehouse. You're scrappy, fast and eager for work, and you'll cut price to win the gig. Keep it short and casual.",
    perks: [
      "Free extra wireless handheld mic",
      "Free setup/tear-down labor",
    ],
  },
  {
    id: "av_lumen_stageworks",
    name: "Lumen Stageworks",
    category: "av",
    city: "New York, NY",
    emoji: "💡",
    tagline: "Broadway-grade lighting, LED walls and live production",
    rating: 4.9,
    dietaryCapabilities: [],
    pricing: { unit: "flat", list: 12000, floor: 10300 },
    style: "premium",
    persona:
      "You are Jasmine Ortiz, executive producer at Lumen Stageworks — your crew lights Broadway shows. You're confident and talk about production value and reliability. You rarely discount; you'd rather add a technician or a lighting upgrade.",
    perks: [
      "Free uplighting package in brand colors",
      "Dedicated show caller for the run of show",
      "Complimentary livestream of the keynote",
    ],
  },
  {
    id: "av_bridge_tunnel",
    name: "Bridge & Tunnel Sound",
    category: "av",
    city: "Brooklyn, NY",
    emoji: "🔊",
    tagline: "Full-service sound, screens and DJ booths",
    rating: 4.5,
    dietaryCapabilities: [],
    pricing: { unit: "flat", list: 6800, floor: 4700 },
    style: "flexible",
    persona:
      "You are Danny Russo, booking manager at Bridge & Tunnel Sound. You're chatty, friendly and creative about bundling — you like to throw in gear instead of arguing over dollars, but you'll meet people in the middle.",
    perks: [
      "Free DJ booth & party playlist after the program",
      "Complimentary second projection screen",
      "Free on-site tech for the full day",
    ],
  },
  {
    id: "av_metro_rig",
    name: "Metro Rig Productions",
    category: "av",
    city: "New York, NY",
    emoji: "🎥",
    tagline: "Union crew, conference-grade AV for big rooms",
    rating: 4.4,
    dietaryCapabilities: [],
    pricing: { unit: "flat", list: 7900, floor: 6700 },
    style: "stubborn",
    persona:
      "You are Linda Park, operations manager at Metro Rig Productions. You're businesslike and blunt, citing union labor rates and insurance costs; you concede slowly and in small increments.",
    perks: [
      "Free confidence monitor for speakers",
      "Complimentary pre-event tech rehearsal",
    ],
  },
];

export function getVendor(id: string): Vendor | undefined {
  return VENDORS.find((v) => v.id === id);
}

export function vendorsFor(category: Category): Vendor[] {
  return VENDORS.filter((v) => v.category === category);
}

/** Total USD for a vendor at a given per-unit price (defaults to list). Whole dollars. */
export function quoteTotal(
  vendor: Vendor,
  headcount: number,
  perUnit: number = vendor.pricing.list,
): number {
  const total = vendor.pricing.unit === "per_person" ? perUnit * headcount : perUnit;
  return Math.round(total);
}
