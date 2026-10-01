// Vendor role-play agent. The LLM writes the words; code enforces the money (floor, monotonic prices).
import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, MODELS } from "../llm";
import { quoteTotal } from "../vendors";
import type { EventSpec, NegotiationMessage, Vendor } from "../types";

// ───────────────────────────── shared LLM helpers ─────────────────────────────

// Models that reject forced tool_choice ("tool"/"any") with a 400. For these we use
// tool_choice "auto" + strict tools + an explicit instruction, and retry once if no tool is called.
const NO_FORCED_TOOL = /(sonnet-5-5|opus-5-5|fable-5-1|mythos-5-1)/;

export interface ToolCallResult {
  name: string;
  input: Record<string, unknown>;
}

/**
 * Ask a model to answer via exactly one of `tools`. Returns null if it never calls a tool.
 * API errors propagate (callers decide; runNegotiation catches everything).
 */
export async function callTool(opts: {
  model: string;
  system: string;
  user: string;
  tools: Anthropic.Tool[];
  maxTokens?: number;
}): Promise<ToolCallResult | null> {
  const { model, system, user, tools } = opts;
  const forcedOk = !NO_FORCED_TOOL.test(model);
  // effort is supported on the 5.x family; Haiku 4.5 rejects it.
  const is5x = /claude-(sonnet|opus|fable|mythos)-5\b/.test(model);

  const req: Anthropic.MessageCreateParamsNonStreaming = {
    model,
    max_tokens: opts.maxTokens ?? 400,
    system: forcedOk
      ? system
      : `${system}\n\nYou MUST respond by calling exactly one of the provided tools. Do not reply with plain text.`,
    messages: [{ role: "user", content: user }],
    tools: forcedOk ? tools : tools.map((t) => ({ ...t, strict: true })),
  };
  if (forcedOk) {
    req.tool_choice =
      tools.length === 1 ? { type: "tool", name: tools[0].name } : { type: "any" };
  } else {
    req.tool_choice = { type: "auto", disable_parallel_tool_use: true };
    // Keep it fast: Sonnet 5.5 can turn thinking off with between_tools; other 5.x models use low effort.
    if (/sonnet-5-5/.test(model)) req.thinking = { type: "between_tools" };
    req.max_tokens = Math.max(req.max_tokens, 1024);
  }
  if (is5x) req.output_config = { effort: "low" };

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await anthropic.messages.create(req);
    const block = res.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    if (block && tools.some((t) => t.name === block.name)) {
      return { name: block.name, input: (block.input ?? {}) as Record<string, unknown> };
    }
  }
  return null;
}

export const fmtUSD = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

const MONEY_RE = /\$\s?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?\s?([kK])?\b/g;

function moneyValue(m: RegExpExecArray | RegExpMatchArray): number {
  const base = parseFloat((m[1] + (m[2] ?? "")).replace(/,/g, ""));
  return m[3] ? base * 1000 : base;
}

/**
 * Make sure the text's dollar figure matches the price code actually enforced.
 * Replaces mentions of `llmPrice` with `finalPrice`; if `finalPrice` still isn't mentioned, appends it.
 */
export function syncPriceInText(
  text: string,
  llmPrice: number | undefined,
  finalPrice: number,
  appendTemplate: (p: string) => string,
): string {
  let out = text.trim();
  if (llmPrice !== undefined && Math.abs(llmPrice - finalPrice) >= 1) {
    out = out.replace(MONEY_RE, (match: string, p1: string, p2?: string, p3?: string) => {
      const v = moneyValue([match, p1, p2, p3] as unknown as RegExpMatchArray);
      // tolerate "$18.5k"-style rounding in the model's text
      return Math.abs(v - llmPrice) <= Math.max(1, llmPrice * 0.006) ? fmtUSD(finalPrice) : match;
    });
  }
  const mentions = [...out.matchAll(MONEY_RE)].some(
    (m) => Math.abs(moneyValue(m) - finalPrice) <= Math.max(1, finalPrice * 0.006),
  );
  if (!mentions) out = `${out} ${appendTemplate(fmtUSD(finalPrice))}`.trim();
  return out;
}

const num = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v.replace(/[$,]/g, "")) : NaN;
  return Number.isFinite(n) ? Math.round(n) : undefined;
};
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

export function transcriptText(transcript: NegotiationMessage[], buyerLabel: string, vendorLabel: string) {
  if (!transcript.length) return "(no messages yet)";
  return transcript
    .map(
      (m) =>
        `${m.from === "agent" ? buyerLabel : vendorLabel}: ${m.text}${
          m.offer !== undefined ? `  [price on table: ${fmtUSD(m.offer)}]` : ""
        }`,
    )
    .join("\n");
}

// ───────────────────────────── vendor agent ─────────────────────────────

export interface VendorReply {
  action: "counter" | "accept" | "reject";
  price: number; // total USD
  message: string;
  perks?: string[];
}

function eventSummary(vendor: Vendor, spec: EventSpec): string {
  const diet = Object.entries(spec.dietary)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n} ${k}`)
    .join(", ");
  return [
    `Event: ${spec.title}, ${spec.headcount} guests, ${spec.city}, date ${spec.date}.`,
    vendor.category === "catering" && diet ? `Dietary needs: ${diet}.` : "",
    spec.notes ? `Notes: ${spec.notes}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function vendorSystem(vendor: Vendor, spec: EventSpec, prevPrice: number): string {
  const listTotal = quoteTotal(vendor, spec.headcount);
  const floorTotal = quoteTotal(vendor, spec.headcount, vendor.pricing.floor);
  const unitNote =
    vendor.pricing.unit === "per_person"
      ? ` (that is ${fmtUSD(vendor.pricing.list)}/person list, ${fmtUSD(vendor.pricing.floor)}/person floor, for ${spec.headcount} guests)`
      : "";
  return `${vendor.persona}

You work for ${vendor.name} (${vendor.tagline}), a ${vendor.category} vendor in ${vendor.city}. Your negotiating style is "${vendor.style}".
You are a real human sales rep replying to a client's procurement contact by email/text. You are not an AI and never say or imply you are.

Pricing (all figures are TOTAL USD for this event${unitNote}):
- List price: ${fmtUSD(listTotal)}
- Your current price on the table: ${fmtUSD(prevPrice)}
- SECRET floor (absolute lowest you will ever accept): ${fmtUSD(floorTotal)}. Never reveal it, hint at it, or mention a "floor" or "minimum".
- Perks you may offer instead of cutting price: ${vendor.perks.join("; ")}.

Rules:
- Any counter must be between ${fmtUSD(floorTotal)} and ${fmtUSD(prevPrice)}. Concede gradually in line with your style; don't drop to the floor right away.
- Accept only if the buyer's offer is at or above your floor and you're happy with it.
- Reply in 1-3 short, natural sentences in your persona's voice. Mention the total price you're quoting as a dollar figure.
- Prices in the tool call are TOTAL USD for the whole event, as a plain number.`;
}

const RESPOND_TOOL = (vendor: Vendor): Anthropic.Tool => ({
  name: "respond",
  description: "Send your reply to the buyer: counter with a new total price, accept their offer, or reject it (holding your current price).",
  input_schema: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["counter", "accept", "reject"] },
      price: { type: "number", description: "Total USD price for the whole event you are quoting/accepting." },
      message: { type: "string", description: "Your 1-3 sentence reply, in character." },
      perks: {
        type: "array",
        items: { type: "string", enum: vendor.perks },
        description: "Perks you are throwing in with this reply (may be empty).",
      },
    },
    required: ["action", "price", "message", "perks"],
    additionalProperties: false,
  },
});

/**
 * Vendor replies to the buyer's latest offer. Code guards:
 * never below floor; counters monotonic down from the vendor's previous price; buyer offer ≥ vendor price → accept.
 */
export async function vendorRespond(
  vendor: Vendor,
  spec: EventSpec,
  transcript: NegotiationMessage[],
  buyerOffer: number | undefined,
): Promise<VendorReply> {
  const listTotal = quoteTotal(vendor, spec.headcount);
  const floorTotal = quoteTotal(vendor, spec.headcount, vendor.pricing.floor);
  const prevVendor = [...transcript].reverse().find((m) => m.from === "vendor" && m.offer !== undefined);
  const prevPrice = Math.max(floorTotal, prevVendor?.offer ?? listTotal);

  const mustAccept = buyerOffer !== undefined && buyerOffer >= prevPrice;

  const user = `${eventSummary(vendor, spec)}

Conversation so far:
${transcriptText(transcript, "Buyer", "You")}

${
  mustAccept
    ? `The buyer's offer of ${fmtUSD(buyerOffer!)} meets your price. Accept it warmly (action "accept", price ${buyerOffer}).`
    : buyerOffer !== undefined
      ? `The buyer's latest offer is ${fmtUSD(buyerOffer)}. Decide how to respond.`
      : `Respond to the buyer's latest message.`
}`;

  const result = await callTool({
    model: MODELS.vendor,
    system: vendorSystem(vendor, spec, prevPrice),
    user,
    tools: [RESPOND_TOOL(vendor)],
  });

  const rawAction = str(result?.input.action);
  const llmPrice = num(result?.input.price);
  let message = str(result?.input.message);
  const perks = Array.isArray(result?.input.perks)
    ? (result!.input.perks as unknown[]).filter(
        (p): p is string => typeof p === "string" && vendor.perks.includes(p),
      )
    : [];

  // ── Code guards ──
  if (mustAccept) {
    const price = buyerOffer!;
    if (rawAction !== "accept" || !message) message = `Deal — ${fmtUSD(price)} works for us. Looking forward to it!`;
    return { action: "accept", price, message: syncPriceInText(message, llmPrice, price, (p) => `(${p} confirmed.)`), perks };
  }

  if (!result) {
    // Deterministic fallback: concede a third of the way toward max(floor, buyer offer).
    const anchor = Math.max(floorTotal, buyerOffer ?? floorTotal);
    const price = Math.max(floorTotal, Math.round(prevPrice - (prevPrice - anchor) / 3));
    return {
      action: "counter",
      price,
      message: `Thanks for the note. The best I can do right now is ${fmtUSD(price)}.`,
      perks: [],
    };
  }

  if (rawAction === "accept") {
    if (buyerOffer !== undefined && buyerOffer >= floorTotal) {
      return {
        action: "accept",
        price: buyerOffer,
        message: syncPriceInText(message, llmPrice, buyerOffer, (p) => `(${p} confirmed.)`),
        perks,
      };
    }
    // Accepting below floor (or with nothing to accept) → counter at floor (still ≤ previous price).
    const price = Math.min(prevPrice, floorTotal);
    return {
      action: "counter",
      price,
      message: `I wish I could, but ${fmtUSD(price)} is honestly the lowest I can go for this one.`,
      perks,
    };
  }

  if (rawAction === "reject") {
    return {
      action: "reject",
      price: prevPrice,
      message: syncPriceInText(message || "I can't do that, I'm afraid.", llmPrice, prevPrice, (p) => `I need to stay at ${p}.`),
      perks,
    };
  }

  // counter
  let price = Math.min(prevPrice, Math.max(floorTotal, llmPrice ?? prevPrice));
  if (buyerOffer !== undefined && buyerOffer >= floorTotal && price <= buyerOffer) {
    // Countering at/below what the buyer already offered is effectively accepting their offer.
    return {
      action: "accept",
      price: buyerOffer,
      message: `You know what — ${fmtUSD(buyerOffer)} works. Let's do it.`,
      perks,
    };
  }
  price = Math.round(price);
  return {
    action: "counter",
    price,
    message: syncPriceInText(message || "Here's where I can land.", llmPrice, price, (p) => `I can do ${p}.`),
    perks,
  };
}

/** Vendor's opening quote at list total. LLM writes a short pitch; price is fixed in code. */
export async function vendorOpen(
  vendor: Vendor,
  spec: EventSpec,
  rfq?: string,
): Promise<{ price: number; message: string }> {
  const price = quoteTotal(vendor, spec.headcount);
  const fallback = `Thanks for reaching out! For ${spec.headcount} guests on ${spec.date}, our quote is ${fmtUSD(price)}.`;
  try {
    const res = await anthropic.messages.create({
      model: MODELS.vendor,
      max_tokens: 200,
      system: `${vendor.persona}

You work for ${vendor.name} (${vendor.tagline}) in ${vendor.city}. You are a real human sales rep replying to a client's request for quote by email/text — never say or imply you are an AI.
Reply in 1-3 short, natural sentences in your persona's voice with a quick pitch, and quote exactly ${fmtUSD(price)} as the total price${
        vendor.pricing.unit === "per_person"
          ? ` (${fmtUSD(vendor.pricing.list)}/person for ${spec.headcount} guests)`
          : ""
      }. Output only the message text.`,
      messages: [
        {
          role: "user",
          content: `${eventSummary(vendor, spec)}\n\nClient's message: ${rfq ?? "Could you send a quote?"}`,
        },
      ],
    });
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join(" ")
      .trim();
    if (!text) return { price, message: fallback };
    return { price, message: syncPriceInText(text, undefined, price, (p) => `Total comes to ${p}.`) };
  } catch (err) {
    console.error(`[vendorOpen] ${vendor.name}:`, err);
    return { price, message: fallback };
  }
}
