// Shared contracts. Every module (agents, API, UI) builds against these types.
// Do not change shapes without updating all consumers.

export type Category = "venue" | "catering" | "av";

export const CATEGORY_LABELS: Record<Category, string> = {
  venue: "Venue",
  catering: "Catering",
  av: "AV & Production",
};

export type DietaryKey =
  | "vegetarian"
  | "vegan"
  | "glutenFree"
  | "nutAllergy"
  | "halal"
  | "kosher";

export type DietaryNeeds = Record<DietaryKey, number>;

export interface EventSpec {
  title: string; // e.g. "Q4 Sales Offsite"
  headcount: number;
  city: string;
  date: string; // free text or ISO, e.g. "2026-10-20"
  budget: number; // total USD
  categories: Category[];
  dietary: DietaryNeeds;
  notes: string; // anything else the planner asked for
}

export interface VendorPricing {
  unit: "flat" | "per_person";
  list: number; // opening ask (per unit)
  floor: number; // HIDDEN walk-away (per unit). Only the vendor agent + code guards may see it.
}

export interface Vendor {
  id: string;
  name: string;
  category: Category;
  city: string;
  emoji: string;
  tagline: string;
  rating: number; // 0-5
  capacity?: number; // venues: max guests
  dietaryCapabilities: DietaryKey[]; // caterers: what they can serve
  pricing: VendorPricing;
  style: "stubborn" | "flexible" | "premium" | "budget";
  persona: string; // role-play instructions for the vendor agent
  perks: string[]; // things vendor can throw in instead of cutting price
}

export type NegotiationStatus =
  | "queued"
  | "contacting"
  | "negotiating"
  | "deal"
  | "walked_away"
  | "disqualified";

export interface NegotiationMessage {
  id: string;
  from: "agent" | "vendor";
  text: string;
  offer?: number; // total USD price attached to this message, if any
  ts: number;
}

export interface Negotiation {
  id: string;
  runId: string;
  vendorId: string;
  vendorName: string;
  vendorEmoji: string;
  category: Category;
  status: NegotiationStatus;
  targetPrice: number; // total USD the buyer agent aims for
  maxPrice: number; // total USD the buyer agent must not exceed
  initialQuote?: number; // total USD, vendor's first number
  currentPrice?: number; // total USD, vendor's latest ask (or final price once a deal closes)
  finalPrice?: number; // total USD, set when status === "deal"
  perks: string[]; // perks won during negotiation
  messages: NegotiationMessage[];
  reason?: string; // why disqualified / walked away
}

export type RunStatus =
  | "parsing"
  | "sourcing"
  | "negotiating"
  | "awaiting_approval"
  | "approved"
  | "failed";

export interface ChatMessage {
  id: string;
  from: "user" | "bot";
  text: string;
  ts: number;
}

export interface VirtualCard {
  id: string;
  vendorName: string;
  category: Category;
  last4: string;
  limit: number; // USD
  status: "active";
}

export interface Selection {
  category: Category;
  negotiationId: string;
  rationale: string;
}

/** Where a Slack-originated run replies: always in the thread of the user's original message. */
export interface SlackThread {
  channel: string;
  threadTs: string;
  userId?: string;
}

export interface Run {
  id: string;
  createdAt: number;
  userPhone?: string; // deprecated (WhatsApp), unused
  slack?: SlackThread;
  brief: string;
  status: RunStatus;
  spec?: EventSpec;
  negotiations: Negotiation[];
  selections: Selection[];
  totals?: { initial: number; final: number; savings: number };
  chat: ChatMessage[];
  cards: VirtualCard[];
  log: { ts: number; text: string }[]; // orchestrator "thoughts" for the UI ticker
  error?: string;
}
