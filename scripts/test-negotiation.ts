/**
 * Negotiation smoke test: runs 3 negotiations in one category in parallel, prints transcripts, checks code guards.
 *
 *   npx tsx --env-file=.env.local scripts/test-negotiation.ts [venue|catering|av] [--mock]
 *   ANTHROPIC_API_KEY=sk-... npx tsx scripts/test-negotiation.ts catering
 *
 * --mock (or no ANTHROPIC_API_KEY) stubs the Anthropic client with an ADVERSARIAL fake model
 * (accepts below floor, counters below floor / above previous, buyer offers above max) to exercise the guards offline.
 */
import { anthropic } from "../lib/llm";
import { createRun, getRun, uid, updateRun } from "../lib/store";
import { quoteTotal, vendorsFor } from "../lib/vendors";
import type { Category, EventSpec, Negotiation } from "../lib/types";
import { runNegotiation } from "../lib/agents/negotiate";

const args = process.argv.slice(2);
const category = (args.find((a) => !a.startsWith("--")) ?? "catering") as Category;
const mock = args.includes("--mock") || !process.env.ANTHROPIC_API_KEY;

const fmt = (n?: number) => (n === undefined ? "—" : `$${n.toLocaleString("en-US")}`);

if (mock) {
  console.log("⚠️  MOCK MODE: Anthropic client stubbed with an adversarial fake model (no API calls).\n");
  const rnd = (a: number, b: number) => Math.round(a + Math.random() * (b - a));
  const grab = (s: string, label: string) => {
    const m = s.match(new RegExp(`${label}[^$]*\\$([\\d,]+)`));
    return m ? parseInt(m[1].replace(/,/g, ""), 10) : 10000;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (anthropic.messages as any).create = async (req: any) => {
    await new Promise((r) => setTimeout(r, 20));
    const sys: string = typeof req.system === "string" ? req.system : "";
    const user: string = String(req.messages?.[0]?.content ?? "");
    const tools: { name: string }[] = req.tools ?? [];
    const toolUse = (name: string, input: unknown) => ({
      content: [{ type: "tool_use", id: uid("tu_"), name, input }],
      stop_reason: "tool_use",
    });
    if (!tools.length) return { content: [{ type: "text", text: "Lovely to hear from you! Happy to help." }] };
    if (tools[0].name === "respond") {
      const cur = grab(sys, "current price on the table");
      const r = Math.random();
      if (r < 0.25) return toolUse("respond", { action: "accept", price: Math.round(cur * 0.5), message: "Sure, deal!", perks: [] });
      if (r < 0.5) return toolUse("respond", { action: "counter", price: Math.round(cur * 0.6), message: `How about $${Math.round(cur * 0.6)}?`, perks: [] });
      if (r < 0.6) return toolUse("respond", { action: "counter", price: Math.round(cur * 1.2), message: "Prices went up.", perks: [] });
      if (r < 0.7) return toolUse("respond", { action: "reject", price: 1, message: "No way.", perks: [] });
      return toolUse("respond", { action: "counter", price: Math.round(cur * 0.95), message: "I can shave a bit off.", perks: [] });
    }
    const vp = grab(user, "Vendor's current price on the table");
    const r = Math.random();
    if (r < 0.15) return toolUse("accept", { message: "Deal." });
    if (r < 0.25) return toolUse("walk_away", { reason: "too pricey", message: "Bye." });
    if (r < 0.4) return { content: [{ type: "text", text: "no tool call" }], stop_reason: "end_turn" };
    return toolUse("make_offer", { price: rnd(vp * 0.4, vp * 1.5), message: "Here's our offer." });
  };
}

const LIMITS: Record<Category, { target: number; max: number }> = {
  venue: { target: 16000, max: 22000 },
  catering: { target: 10000, max: 13500 },
  av: { target: 4500, max: 7000 },
};

function checkGuards(n: Negotiation, floor: number): string[] {
  const errs: string[] = [];
  const vendorOffers = n.messages.filter((m) => m.from === "vendor" && m.offer !== undefined).map((m) => m.offer!);
  const agentOffers = n.messages.filter((m) => m.from === "agent" && m.offer !== undefined).map((m) => m.offer!);
  vendorOffers.forEach((p, i) => {
    if (p < floor) errs.push(`vendor price ${p} below floor ${floor}`);
    if (i > 0 && p > vendorOffers[i - 1]) errs.push(`vendor price went UP ${vendorOffers[i - 1]} → ${p}`);
  });
  agentOffers.forEach((p, i) => {
    if (p > n.maxPrice) errs.push(`buyer offer ${p} above max ${n.maxPrice}`);
    if (i > 0 && p < agentOffers[i - 1]) errs.push(`buyer offer went DOWN ${agentOffers[i - 1]} → ${p}`);
  });
  if (n.status !== "deal" && n.status !== "walked_away") errs.push(`non-terminal status ${n.status}`);
  if (n.status === "deal") {
    if (n.finalPrice === undefined) errs.push("deal without finalPrice");
    else {
      if (n.finalPrice < floor) errs.push(`deal ${n.finalPrice} below floor ${floor}`);
      if (n.finalPrice > n.maxPrice) errs.push(`deal ${n.finalPrice} above max ${n.maxPrice}`);
    }
  }
  if (n.reason?.startsWith("Agent error")) errs.push(n.reason);
  return errs;
}

async function main(iteration = 0): Promise<number> {
  const spec: EventSpec = {
    title: "Q4 Sales Offsite",
    headcount: 120,
    city: "New York, NY",
    date: "2026-10-20",
    budget: 45000,
    categories: ["venue", "catering", "av"],
    dietary: { vegetarian: 20, vegan: 4, glutenFree: 5, nutAllergy: 2, halal: 3, kosher: 0 },
    notes: "Evening event with a keynote and networking.",
  };
  const run = createRun("120-person offsite in NYC Oct 20, $45k budget");
  const vendors = vendorsFor(category)
    .filter((v) => category !== "catering" || v.dietaryCapabilities.includes("glutenFree"))
    .filter((v) => category !== "venue" || (v.capacity ?? 0) >= spec.headcount)
    .slice(0, 3);
  const { target, max } = LIMITS[category];

  updateRun(run.id, (r) => {
    r.spec = spec;
    r.status = "negotiating";
    for (const v of vendors) {
      r.negotiations.push({
        id: uid("neg_"),
        runId: r.id,
        vendorId: v.id,
        vendorName: v.name,
        vendorEmoji: v.emoji,
        category,
        status: "queued",
        targetPrice: target,
        maxPrice: max,
        perks: [],
        messages: [],
      });
    }
  });

  const t0 = Date.now();
  await Promise.all(getRun(run.id)!.negotiations.map((n) => runNegotiation(run.id, n.id)));
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  let failures = 0;
  for (const n of getRun(run.id)!.negotiations) {
    const v = vendors.find((x) => x.id === n.vendorId)!;
    const floor = quoteTotal(v, spec.headcount, v.pricing.floor);
    const errs = checkGuards(n, floor);
    failures += errs.length;
    if (mock && iteration > 0 && !errs.length) continue; // keep mock fuzz output short
    console.log(`\n━━━ ${n.vendorEmoji} ${n.vendorName} (${v.style}) — list ${fmt(quoteTotal(v, spec.headcount))}, hidden floor ${fmt(floor)}, target ${fmt(n.targetPrice)}, max ${fmt(n.maxPrice)}`);
    for (const m of n.messages) {
      console.log(`  ${m.from === "agent" ? "🤖 Haggle" : "🏪 Vendor"}${m.offer !== undefined ? ` [${fmt(m.offer)}]` : ""}: ${m.text}`);
    }
    console.log(`  ⇒ ${n.status.toUpperCase()}  initial ${fmt(n.initialQuote)}  final ${fmt(n.finalPrice)}  perks: ${n.perks.join("; ") || "none"}${n.reason ? `  reason: ${n.reason}` : ""}`);
    console.log(errs.length ? `  ❌ GUARD VIOLATIONS: ${errs.join(" | ")}` : "  ✅ guards hold");
  }
  if (!mock || iteration === 0) console.log(`\nCompleted in ${secs}s`);
  return failures;
}

(async () => {
  const iterations = mock ? 20 : 1;
  let failures = 0;
  for (let i = 0; i < iterations; i++) failures += await main(i);
  console.log(mock ? `\nMock fuzz: ${iterations} runs × 3 negotiations, ${failures} guard violations.` : "");
  process.exit(failures ? 1 : 0);
})();
