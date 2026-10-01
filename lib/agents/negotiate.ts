// Buyer agent loop: one negotiation (buyer agent ⇄ vendor agent) until deal / walked_away. Never throws.
import type Anthropic from "@anthropic-ai/sdk";
import { MODELS } from "../llm";
import { getRun, uid, updateRun } from "../store";
import { getVendor } from "../vendors";
import type { EventSpec, Negotiation, NegotiationMessage, Vendor } from "../types";
import { CATEGORY_LABELS } from "../types";
import { callTool, fmtUSD, syncPriceInText, transcriptText, vendorOpen, vendorRespond } from "./vendor";

const MAX_ROUNDS = 5;
const TARGET_FRACTION_OF_QUOTE = 0.72; // aim ~28% below each vendor's opening quote

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function patch(runId: string, negotiationId: string, fn: (n: Negotiation) => void) {
  updateRun(runId, (r) => {
    const n = r.negotiations.find((x) => x.id === negotiationId);
    if (n) fn(n);
  });
}

function addMessage(
  runId: string,
  negotiationId: string,
  from: NegotiationMessage["from"],
  text: string,
  offer?: number,
) {
  patch(runId, negotiationId, (n) => {
    const msg: NegotiationMessage = { id: uid("nm_"), from, text, ts: Date.now() };
    if (offer !== undefined) {
      msg.offer = offer;
      // currentPrice = vendor's latest ask (what competitors may cite), never our own counter.
      if (from === "vendor") n.currentPrice = offer;
    }
    n.messages.push(msg);
  });
}

function snapshot(runId: string, negotiationId: string): Negotiation {
  const n = getRun(runId)?.negotiations.find((x) => x.id === negotiationId);
  if (!n) throw new Error(`Negotiation ${negotiationId} not found in run ${runId}`);
  return structuredClone(n);
}

function rfqText(vendor: Vendor, spec: EventSpec): string {
  const when = spec.date ? ` on ${spec.date}` : "";
  const intro = `Hi ${vendor.name} team — I'm coordinating "${spec.title}", a ${spec.headcount}-person event in ${spec.city}${when}.`;
  if (vendor.category === "catering") {
    const labels: Record<string, string> = {
      vegetarian: "vegetarian",
      vegan: "vegan",
      glutenFree: "gluten-free",
      nutAllergy: "nut-allergy",
      halal: "halal",
      kosher: "kosher",
    };
    const diet = Object.entries(spec.dietary)
      .filter(([, c]) => c > 0)
      .map(([k, c]) => `${c} ${labels[k] ?? k}`)
      .join(", ");
    return `${intro} Could you quote full catering for ${spec.headcount} guests${diet ? `, including ${diet} meals` : ""}? Please send your best all-in price.`;
  }
  if (vendor.category === "venue") {
    return `${intro} We need a space for ${spec.headcount} guests for the evening. What's your all-in rental price?`;
  }
  return `${intro} We need AV for ${spec.headcount} attendees — sound, mics and projection for talks. What would your all-in quote be?`;
}

function competingQuotes(runId: string, me: Negotiation): string[] {
  const run = getRun(runId);
  if (!run) return [];
  return run.negotiations
    .filter(
      (o) =>
        o.id !== me.id &&
        o.category === me.category &&
        o.status !== "disqualified" &&
        o.status !== "queued" &&
        (o.finalPrice ?? o.currentPrice) !== undefined,
    )
    .map((o) => {
      const price = o.finalPrice ?? o.currentPrice!;
      const state =
        o.status === "deal" ? "agreed deal" : o.status === "walked_away" ? "last quote (talks ended)" : "current quote";
      return `- ${o.vendorName}: ${fmtUSD(price)} (${state})`;
    });
}

const BUYER_TOOLS: Anthropic.Tool[] = [
  {
    name: "make_offer",
    description: "Send the vendor a counter-offer (total USD for the whole event) with a short message.",
    input_schema: {
      type: "object",
      properties: {
        price: { type: "number", description: "Your offer, TOTAL USD for the whole event." },
        message: { type: "string", description: "1-3 sentence message to the vendor that states your offer." },
      },
      required: ["price", "message"],
      additionalProperties: false,
    },
  },
  {
    name: "accept",
    description: "Accept the vendor's current price on the table.",
    input_schema: {
      type: "object",
      properties: { message: { type: "string", description: "Short acceptance message." } },
      required: ["message"],
      additionalProperties: false,
    },
  },
  {
    name: "walk_away",
    description: "End the negotiation without a deal (only when the vendor won't get within your max price).",
    input_schema: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Internal one-line reason for the planner." },
        message: { type: "string", description: "Polite closing message to the vendor." },
      },
      required: ["reason", "message"],
      additionalProperties: false,
    },
  },
];

function buyerSystem(spec: EventSpec, n: Negotiation): string {
  return `You are Haggle, a shrewd but polite procurement agent negotiating on behalf of an event planner. You are emailing/texting a ${CATEGORY_LABELS[n.category]} vendor.
Goals: get the lowest total price, and ask for perks/extras (free add-ons, upgrades) when useful.
- Target total: ${fmtUSD(n.targetPrice)}. Hard max total: ${fmtUSD(n.maxPrice)} — NEVER offer or accept above the max, and never reveal your max or target.
- Always open with a counter-offer (even if the first quote looks fine — push below it). After that, if the vendor's price is at or below your target, accept it.
- Use leverage: competing quotes from other vendors in this category are provided each turn. You may cite them by vendor name and price ("Another venue quoted $X"), but ONLY cite numbers from that list — never invent quotes.
- Raise your offers gradually; never offer less than you offered before.
- Keep messages to 1-3 short, natural sentences. State your offer as a dollar figure. All prices are TOTAL USD for the event.
Event: "${spec.title}", ${spec.headcount} guests, ${spec.city}, ${spec.date}. Overall event budget ${fmtUSD(spec.budget)}.`;
}

export async function runNegotiation(runId: string, negotiationId: string): Promise<void> {
  try {
    const run = getRun(runId);
    if (!run) throw new Error(`Run ${runId} not found`);
    const spec = run.spec;
    if (!spec) throw new Error("Run has no spec");
    const start = snapshot(runId, negotiationId);
    const vendor = getVendor(start.vendorId);
    if (!vendor) throw new Error(`Unknown vendor ${start.vendorId}`);
    const maxPrice = Math.round(start.maxPrice);
    let targetPrice = Math.min(Math.round(start.targetPrice), maxPrice);

    // 1. RFQ
    patch(runId, negotiationId, (n) => (n.status = "contacting"));
    await sleep(300 + Math.random() * 900);
    const rfq = rfqText(vendor, spec);
    addMessage(runId, negotiationId, "agent", rfq);

    // 2. Opening quote
    const open = await vendorOpen(vendor, spec, rfq);
    addMessage(runId, negotiationId, "vendor", open.message, open.price);
    // Anchor the target to this vendor's own quote too, so a quote that's already under
    // budget still gets pushed hard instead of accepted after one round.
    targetPrice = Math.min(targetPrice, Math.round(open.price * TARGET_FRACTION_OF_QUOTE));
    patch(runId, negotiationId, (n) => {
      n.targetPrice = targetPrice;
      n.initialQuote = open.price;
      n.currentPrice = open.price;
      n.status = "negotiating";
    });

    let vendorPrice = open.price;
    let lastBuyerOffer: number | undefined;

    const closeDeal = (price: number, perks: string[] = []) =>
      patch(runId, negotiationId, (n) => {
        n.status = "deal";
        n.finalPrice = price;
        n.currentPrice = price;
        for (const p of perks) if (!n.perks.includes(p)) n.perks.push(p);
      });
    const walk = (reason: string) =>
      patch(runId, negotiationId, (n) => {
        n.status = "walked_away";
        n.reason = reason;
      });

    // 3. Rounds
    for (let round = 1; round <= MAX_ROUNDS; round++) {
      const cur = snapshot(runId, negotiationId);
      const competitors = competingQuotes(runId, cur);
      const isLast = round === MAX_ROUNDS;

      const user = `Round ${round} of ${MAX_ROUNDS}${isLast ? " (FINAL round — if the vendor doesn't come down enough after this, we wrap up)" : ""}.
Vendor: ${vendor.name} — ${vendor.tagline} (rating ${vendor.rating}).
Vendor's current price on the table: ${fmtUSD(vendorPrice)}.
Your previous offer: ${lastBuyerOffer !== undefined ? fmtUSD(lastBuyerOffer) : "none yet"}.
Perks won so far: ${cur.perks.length ? cur.perks.join("; ") : "none"}.

Live competing quotes in this category (only cite these):
${competitors.length ? competitors.join("\n") : "(none available yet — don't cite any)"}

Conversation so far:
${transcriptText(cur.messages, "You", vendor.name)}

Decide your next move by calling one tool.`;

      const decision = await callTool({
        model: MODELS.negotiator,
        system: buyerSystem(spec, { ...cur, targetPrice, maxPrice }),
        user,
        tools: BUYER_TOOLS,
      });

      let action = decision?.name ?? "make_offer";
      let message = typeof decision?.input.message === "string" ? decision.input.message.trim() : "";
      const rawOffer = decision?.input.price;
      const llmOffer =
        typeof rawOffer === "number" && Number.isFinite(rawOffer) ? Math.round(rawOffer) : undefined;

      // ── Code guards (buyer) ──
      if (lastBuyerOffer === undefined) {
        action = "make_offer"; // always counter at least once — never take the opening quote as-is
      } else {
        if (vendorPrice <= targetPrice) action = "accept";
        if (action === "walk_away" && vendorPrice <= maxPrice) action = "accept"; // within budget → take it
        if (action === "accept" && vendorPrice > maxPrice) action = "make_offer"; // can't accept above max
      }

      if (action === "accept") {
        if (!decision || decision.name !== "accept" || !message)
          message = `That works for us — ${fmtUSD(vendorPrice)} it is. Let's lock it in.`;
        addMessage(runId, negotiationId, "agent", message, vendorPrice);
        closeDeal(vendorPrice);
        return;
      }

      if (action === "walk_away") {
        const reason =
          (typeof decision?.input.reason === "string" && decision.input.reason.trim()) ||
          `Vendor's best price ${fmtUSD(vendorPrice)} exceeds max ${fmtUSD(maxPrice)}`;
        addMessage(runId, negotiationId, "agent", message || "Thanks for your time — we'll have to pass on this one.");
        walk(reason);
        return;
      }

      // make_offer
      const fallbackOffer = Math.round(
        lastBuyerOffer === undefined
          ? Math.min(targetPrice, vendorPrice * 0.8)
          : lastBuyerOffer + (Math.min(vendorPrice, maxPrice) - lastBuyerOffer) / 2,
      );
      let offer = llmOffer ?? fallbackOffer;
      offer = Math.min(offer, maxPrice, vendorPrice); // never above max, never above what they're asking
      if (lastBuyerOffer !== undefined) offer = Math.max(offer, Math.min(lastBuyerOffer, maxPrice)); // monotonic up
      offer = Math.max(1, Math.round(offer));
      if (decision?.name !== "make_offer") message = ""; // LLM's text was for a different action
      message = syncPriceInText(
        message || `Could you do ${fmtUSD(offer)}?`,
        llmOffer,
        offer,
        (p) => `We can offer ${p}.`,
      );
      addMessage(runId, negotiationId, "agent", message, offer);
      lastBuyerOffer = offer;

      // Vendor turn
      const transcript = snapshot(runId, negotiationId).messages;
      const reply = await vendorRespond(vendor, spec, transcript, offer);
      addMessage(runId, negotiationId, "vendor", reply.message, reply.price);
      if (reply.perks?.length) {
        patch(runId, negotiationId, (n) => {
          for (const p of reply.perks!) if (!n.perks.includes(p)) n.perks.push(p);
        });
      }

      if (reply.action === "accept") {
        closeDeal(reply.price);
        return;
      }
      vendorPrice = Math.min(vendorPrice, reply.price);
    }

    // 4. Out of rounds
    if (vendorPrice <= maxPrice) {
      addMessage(
        runId,
        negotiationId,
        "agent",
        `Alright — we'll take it at ${fmtUSD(vendorPrice)}. Please send over the paperwork.`,
        vendorPrice,
      );
      closeDeal(vendorPrice);
    } else {
      addMessage(
        runId,
        negotiationId,
        "agent",
        `Thanks for working with us, but ${fmtUSD(vendorPrice)} is beyond what we can do. We'll have to pass this time.`,
      );
      walk(`Vendor's best price ${fmtUSD(vendorPrice)} exceeds our max of ${fmtUSD(maxPrice)}`);
    }
  } catch (err) {
    console.error(`[runNegotiation] ${negotiationId}:`, err);
    const msg = err instanceof Error ? err.message : String(err);
    try {
      patch(runId, negotiationId, (n) => {
        n.status = "walked_away";
        n.reason = `Agent error: ${msg}`.slice(0, 300);
      });
    } catch (e) {
      console.error(`[runNegotiation] failed to record error:`, e);
    }
  }
}
