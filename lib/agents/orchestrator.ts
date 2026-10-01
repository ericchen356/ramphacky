// Orchestrator agent: parse brief → source vendors → run the negotiation swarm → pick winners → approve/book.
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { anthropic, MODELS } from "../llm";
import {
  addChat,
  addLog,
  createRun,
  getRun,
  uid,
  updateRun,
} from "../store";
import { notifyUser } from "../notify";
import { issueVirtualCards } from "../finance";
import { vendorsFor, quoteTotal } from "../vendors";
import { runNegotiation } from "./negotiate";
import {
  CATEGORY_LABELS,
  type Category,
  type DietaryKey,
  type DietaryNeeds,
  type EventSpec,
  type Negotiation,
  type Run,
  type Selection,
  type SlackThread,
} from "../types";

// ───────────────────────────── constants / formatting ─────────────────────────────

const ALL_CATEGORIES: Category[] = ["venue", "catering", "av"];
const DIETARY_KEYS: DietaryKey[] = [
  "vegetarian",
  "vegan",
  "glutenFree",
  "nutAllergy",
  "halal",
  "kosher",
];
const DIETARY_LABEL: Record<DietaryKey, string> = {
  vegetarian: "vegetarian",
  vegan: "vegan",
  glutenFree: "gluten-free",
  nutAllergy: "nut-free",
  halal: "halal",
  kosher: "kosher",
};
const DIETARY_SHORT: Record<DietaryKey, string> = {
  vegetarian: "veg",
  vegan: "vegan",
  glutenFree: "GF",
  nutAllergy: "nut-free",
  halal: "halal",
  kosher: "kosher",
};
const CATEGORY_EMOJI: Record<Category, string> = {
  venue: "🏛",
  catering: "🍽",
  av: "🎤",
};
const BUDGET_WEIGHTS: Record<Category, number> = {
  venue: 0.45,
  catering: 0.4,
  av: 0.15,
};
const DEFAULT_BUDGET = 40000;
const DEFAULT_CITY = "New York";

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const usdK = (n: number) => {
  if (n >= 1000) {
    const k = n / 1000;
    return `$${Number.isInteger(k) ? k : k.toFixed(1).replace(/\.0$/, "")}k`;
  }
  return usd(n);
};
const shortCity = (c: string) =>
  /^(new york( city)?|nyc|manhattan)$/i.test(c.trim()) ? "NYC" : c;
function shortDate(d: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const dt = new Date(`${d}T12:00:00Z`);
    if (!Number.isNaN(dt.getTime()))
      return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  }
  return d || "date TBD";
}
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ───────────────────────────── parseBrief ─────────────────────────────

const EVENT_SPEC_TOOL: Anthropic.Tool = {
  name: "create_event_spec",
  description:
    "Record the structured event specification extracted from the planner's brief. Always call this exactly once.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "Short, nice event title (2-5 words), e.g. 'Q4 Sales Offsite'.",
      },
      headcount: { type: "integer", description: "Number of guests." },
      city: { type: "string", description: `City. Use "${DEFAULT_CITY}" if unspecified.` },
      date: {
        type: "string",
        description: "Event date as ISO YYYY-MM-DD if determinable (assume the next upcoming occurrence), else free text, else 'TBD'.",
      },
      budget: {
        type: "number",
        description: `Total budget in USD (e.g. "$45k" → 45000). Use ${DEFAULT_BUDGET} if not given.`,
      },
      categories: {
        type: "array",
        items: { type: "string", enum: ALL_CATEGORIES },
        description:
          "Vendor categories needed. Default to all three unless the brief clearly limits them.",
      },
      dietary: {
        type: "object",
        description:
          "Guest COUNTS per dietary need (convert percentages to counts using headcount, rounding). 0 if not mentioned. 'nut allergies' → nutAllergy.",
        properties: Object.fromEntries(DIETARY_KEYS.map((k) => [k, { type: "integer" }])),
        required: DIETARY_KEYS,
        additionalProperties: false,
      },
      notes: {
        type: "string",
        description: "Anything else the planner asked for (vibe, timing, special requests). Empty string if none.",
      },
    },
    required: ["title", "headcount", "city", "date", "budget", "categories", "dietary", "notes"],
    additionalProperties: false,
  },
};

const num = (fallback: number) =>
  z.coerce
    .number()
    .refine((n) => Number.isFinite(n) && n >= 0)
    .transform((n) => Math.round(n))
    .catch(fallback);

const DietarySchema = z
  .object(Object.fromEntries(DIETARY_KEYS.map((k) => [k, num(0)])) as Record<DietaryKey, ReturnType<typeof num>>)
  .partial()
  .catch({});

const SpecSchema = z.object({
  title: z.string().trim().min(1).catch("Team Event"),
  headcount: num(0),
  city: z.string().trim().min(1).catch(DEFAULT_CITY),
  date: z.string().trim().min(1).catch("TBD"),
  budget: num(DEFAULT_BUDGET),
  categories: z.array(z.string()).catch([]),
  dietary: DietarySchema,
  notes: z.string().catch(""),
});

/** Validate + coerce raw model output into a fully-populated EventSpec. */
function normalizeSpec(raw: unknown, brief: string): EventSpec {
  const p = SpecSchema.parse(raw ?? {});
  const fallback = heuristicSpec(brief);
  const headcount = p.headcount > 0 ? p.headcount : fallback.headcount;
  const cats = ALL_CATEGORIES.filter((c) => p.categories.includes(c));
  const dietary = {} as DietaryNeeds;
  for (const k of DIETARY_KEYS) dietary[k] = Math.min(p.dietary[k] ?? 0, headcount);
  return {
    title: p.title.slice(0, 60),
    headcount,
    city: p.city,
    date: p.date,
    budget: p.budget > 0 ? p.budget : DEFAULT_BUDGET,
    categories: cats.length ? cats : [...ALL_CATEGORIES],
    dietary,
    notes: p.notes,
  };
}

/** Deterministic regex parser — used only if the LLM call fails, so the demo never dies at step one. */
function heuristicSpec(brief: string): EventSpec {
  const t = brief.toLowerCase();
  const head =
    t.match(/(\d[\d,]*)\s*(?:-\s*)?(?:people|persons?|guests|attendees|pax|folks|ppl|employees|heads)/) ??
    t.match(/for\s+(\d[\d,]*)/);
  const headcount = head ? parseInt(head[1].replace(/,/g, ""), 10) : 50;
  const b = t.match(/\$\s*([\d,.]+)\s*(k|m)?/) ?? t.match(/([\d,.]+)\s*(k)\s*(?:budget|usd|dollars)/);
  let budget = DEFAULT_BUDGET;
  if (b) {
    const v = parseFloat(b[1].replace(/,/g, ""));
    budget = b[2] === "k" ? v * 1000 : b[2] === "m" ? v * 1_000_000 : v;
  }
  const count = (re: RegExp) => {
    const m = t.match(re);
    if (!m) return 0;
    const v = parseFloat(m[1]);
    return m[2] === "%" ? Math.round((v / 100) * headcount) : Math.round(v);
  };
  const dietary: DietaryNeeds = {
    vegetarian: count(/(\d+)\s*(%)?\s*(?:are\s+)?veg(?:etarian|gie)s?/),
    vegan: count(/(\d+)\s*(%)?\s*(?:are\s+)?vegans?/),
    glutenFree: count(/(\d+)\s*(%)?\s*(?:are\s+)?(?:gluten[- ]free|gf|celiac)/),
    nutAllergy: count(/(\d+)\s*(%)?\s*(?:with\s+)?(?:nut|peanut|tree[- ]nut)/),
    halal: count(/(\d+)\s*(%)?\s*halal/),
    kosher: count(/(\d+)\s*(%)?\s*kosher/),
  };
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const dm = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/);
  let date = "TBD";
  if (dm) {
    const now = new Date();
    const mi = months.indexOf(dm[1]);
    let y = now.getUTCFullYear();
    if (new Date(Date.UTC(y, mi, +dm[2])) < new Date(Date.UTC(y, now.getUTCMonth(), now.getUTCDate()))) y++;
    date = `${y}-${String(mi + 1).padStart(2, "0")}-${String(+dm[2]).padStart(2, "0")}`;
  }
  const mentioned = ALL_CATEGORIES.filter((c) =>
    c === "venue" ? /venue|space|room/.test(t) : c === "catering" ? /cater|food|lunch|dinner/.test(t) : /\bav\b|audio|sound|projector|mic|production/.test(t),
  );
  const onlyMatch = /\bonly\b|\bjust\b/.test(t) && mentioned.length > 0;
  return {
    title: /offsite/.test(t) ? "Team Offsite" : "Team Event",
    headcount,
    city: DEFAULT_CITY, // vendors are NYC-only for the demo
    date,
    budget,
    categories: onlyMatch ? mentioned : [...ALL_CATEGORIES],
    dietary,
    notes: "",
  };
}

export async function parseBrief(brief: string): Promise<EventSpec> {
  const today = new Date().toISOString().slice(0, 10);
  const system =
    `You are the orchestrator of an event-planning agent swarm. Extract a structured event spec from the planner's brief by calling the create_event_spec tool exactly once. Today's date is ${today}.\n` +
    `Rules: city defaults to "${DEFAULT_CITY}" when unspecified ("NYC" → "${DEFAULT_CITY}"). Categories default to all of venue, catering and av unless the brief clearly limits them. ` +
    `Dietary values are guest COUNTS — convert percentages using the headcount; 0 when not mentioned. Budget defaults to ${DEFAULT_BUDGET} USD when missing. Give the event a nice short title.`;
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: `Planner brief:\n"""\n${brief}\n"""\n\nCall create_event_spec now.` },
  ];
  const isHaiku = /haiku/i.test(MODELS.orchestrator);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await anthropic.messages.create({
        model: MODELS.orchestrator,
        max_tokens: 4000,
        system,
        tools: [EVENT_SPEC_TOOL],
        tool_choice: { type: "auto" }, // forced tool_choice is rejected on sonnet-5-5; steer via prompt + strict schema
        ...(isHaiku ? {} : { output_config: { effort: "low" as const } }),
        messages,
      });
      const call = res.content.find(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === EVENT_SPEC_TOOL.name,
      );
      if (call) return normalizeSpec(call.input, brief);
      console.warn(`[orchestrator] parseBrief: no tool call (stop_reason=${res.stop_reason}), attempt ${attempt + 1}`);
    } catch (e) {
      console.error(`[orchestrator] parseBrief LLM error (attempt ${attempt + 1}):`, errMsg(e));
    }
  }
  console.warn("[orchestrator] parseBrief: falling back to heuristic parser");
  return heuristicSpec(brief);
}

// ───────────────────────────── pipeline ─────────────────────────────

// On globalThis: Next bundles route handlers and instrumentation (Slack bot) separately, so a
// module-level Set would not be shared between the dashboard and Slack approve paths.
const gApproving = globalThis as unknown as { __haggleApproving?: Set<string> };
const approving = (gApproving.__haggleApproving ??= new Set<string>());

export function startRun(brief: string, opts?: { slack?: SlackThread }): Run {
  const run = createRun(brief);
  if (opts?.slack) {
    const slack = opts.slack;
    updateRun(run.id, (r) => {
      r.slack = slack;
    });
  }
  addChat(run.id, "user", brief);
  void pipeline(run.id).catch((e) => fail(run.id, e));
  return getRun(run.id) ?? run;
}

async function fail(runId: string, e: unknown) {
  console.error(`[orchestrator] run ${runId} failed:`, e);
  try {
    updateRun(runId, (r) => {
      r.status = "failed";
      r.error = errMsg(e);
    });
    addLog(runId, `❌ Pipeline failed: ${errMsg(e)}`);
  } catch {
    /* run vanished */
  }
  try {
    await notifyUser(
      runId,
      "😓 Sorry — something went wrong while planning your event. Please send the brief again and I'll retry.",
    );
  } catch {
    /* never throw */
  }
}

function setStatus(runId: string, status: Run["status"]) {
  updateRun(runId, (r) => {
    r.status = status;
  });
}

function allocations(spec: EventSpec): Record<Category, number> {
  const total = spec.categories.reduce((s, c) => s + BUDGET_WEIGHTS[c], 0) || 1;
  const out = {} as Record<Category, number>;
  for (const c of spec.categories) out[c] = Math.round((spec.budget * BUDGET_WEIGHTS[c]) / total);
  return out;
}

function dietarySummary(d: DietaryNeeds, style: "long" | "short"): string {
  const parts = DIETARY_KEYS.filter((k) => d[k] > 0).map((k) =>
    style === "long" ? `${d[k]} ${DIETARY_LABEL[k]}` : `${d[k]} ${DIETARY_SHORT[k]}`,
  );
  return parts.join(", ");
}

async function pipeline(runId: string): Promise<void> {
  try {
    await pipelineInner(runId);
  } catch (e) {
    await fail(runId, e);
  }
}

async function pipelineInner(runId: string): Promise<void> {
  const t0 = Date.now();
  const run0 = getRun(runId);
  if (!run0) throw new Error(`Run not found: ${runId}`);

  // ── parsing ──
  setStatus(runId, "parsing");
  addLog(runId, "🧠 Reading the brief…");
  const spec = await parseBrief(run0.brief);
  updateRun(runId, (r) => {
    r.spec = spec;
  });
  addLog(
    runId,
    `Parsed brief → ${spec.headcount} guests · ${shortCity(spec.city)} · ${shortDate(spec.date)} · ${usd(spec.budget)}`,
  );
  const diet = dietarySummary(spec.dietary, "long");
  if (diet) addLog(runId, `🥗 Dietary: ${diet}`);
  addLog(runId, `📋 Need: ${spec.categories.map((c) => CATEGORY_LABELS[c]).join(", ")}`);

  // ── sourcing ──
  setStatus(runId, "sourcing");
  const alloc = allocations(spec);
  addLog(
    runId,
    `💰 Budget split → ${spec.categories.map((c) => `${CATEGORY_LABELS[c]} ${usdK(alloc[c])}`).join(" · ")}`,
  );

  const negotiations: Negotiation[] = [];
  for (const category of spec.categories) {
    const maxPrice = alloc[category];
    const targetPrice = Math.round(maxPrice * 0.8);
    for (const v of vendorsFor(category)) {
      const neg: Negotiation = {
        id: uid("neg_"),
        runId,
        vendorId: v.id,
        vendorName: v.name,
        vendorEmoji: v.emoji,
        category,
        status: "queued",
        targetPrice,
        maxPrice,
        perks: [],
        messages: [],
      };
      if (category === "venue" && typeof v.capacity === "number" && v.capacity < spec.headcount) {
        neg.status = "disqualified";
        neg.reason = `Capacity ${v.capacity} < ${spec.headcount} guests`;
      } else if (category === "catering") {
        const missing = DIETARY_KEYS.find(
          (k) => spec.dietary[k] > 0 && !v.dietaryCapabilities.includes(k),
        );
        if (missing) {
          neg.status = "disqualified";
          neg.reason = `Can't serve ${DIETARY_LABEL[missing]} (${spec.dietary[missing]} guest${spec.dietary[missing] === 1 ? "" : "s"})`;
        }
      }
      negotiations.push(neg);
    }
  }
  updateRun(runId, (r) => {
    r.negotiations = negotiations;
  });

  for (const n of negotiations) {
    if (n.status === "disqualified") addLog(runId, `⛔ ${n.vendorName} disqualified — ${n.reason}`);
  }
  const active = negotiations.filter((n) => n.status !== "disqualified");
  // Fun factoid: who is way over budget at list price.
  for (const category of spec.categories) {
    for (const v of vendorsFor(category)) {
      const n = active.find((x) => x.vendorId === v.id && x.category === category);
      if (!n) continue;
      let list = NaN;
      try {
        list = quoteTotal(v, spec.headcount);
      } catch {
        /* ignore */
      }
      if (Number.isFinite(list) && list > n.maxPrice * 1.3)
        addLog(runId, `😬 ${v.name} lists at ${usd(list)} — ${Math.round((list / n.maxPrice - 1) * 100)}% over allocation. Negotiating anyway.`);
    }
  }

  const activeCats = spec.categories.filter((c) => active.some((n) => n.category === c));
  const catNames = activeCats.map((c) =>
    c === "av" ? "AV" : CATEGORY_LABELS[c].toLowerCase(),
  );
  const catList =
    catNames.length <= 1
      ? catNames.join("")
      : `${catNames.slice(0, -1).join(", ")} & ${catNames[catNames.length - 1]}`;
  await notifyUser(
    runId,
    active.length
      ? `On it 🫡 ${spec.headcount} guests, ${shortCity(spec.city)}, ${shortDate(spec.date)}, ${usdK(spec.budget)}. Deploying ${active.length} negotiation agent${active.length === 1 ? "" : "s"} across ${catList} — I'll post the best deals here in about a minute.`
      : `On it 🫡 ${spec.headcount} guests, ${shortCity(spec.city)}, ${shortDate(spec.date)}, ${usdK(spec.budget)} — but none of our vendors can meet these requirements. 😕`,
  );
  if (!active.length) throw new Error("No eligible vendors for this brief");

  // ── negotiating ──
  setStatus(runId, "negotiating");
  addLog(runId, `🚀 Deploying ${active.length} agents in parallel…`);
  const tNeg = Date.now();
  await Promise.all(
    active.map((n) =>
      Promise.resolve()
        .then(() => runNegotiation(runId, n.id))
        .catch((e) => {
          // Contract says never throws — guard anyway.
          console.error(`[orchestrator] runNegotiation ${n.id} threw:`, e);
          updateRun(runId, (r) => {
            const x = r.negotiations.find((y) => y.id === n.id);
            if (x && x.status !== "deal") {
              x.status = "walked_away";
              x.reason = x.reason ?? `Agent error: ${errMsg(e)}`;
            }
          });
        })
        .then(() => {
          const x = getRun(runId)?.negotiations.find((y) => y.id === n.id);
          if (!x) return;
          if (x.status === "deal" && typeof x.finalPrice === "number") {
            const off =
              x.initialQuote && x.initialQuote > 0
                ? Math.round((1 - x.finalPrice / x.initialQuote) * 100)
                : 0;
            const pct = off > 0 ? ` (−${off}%)` : " (at quote)";
            const perks = x.perks.length ? ` + ${x.perks[0]}` : "";
            addLog(runId, `🤝 Deal with ${x.vendorName} at ${usd(x.finalPrice)}${pct}${perks}`);
          } else if (x.status === "deal" || x.status === "walked_away") {
            addLog(runId, `🚶 ${x.vendorName} — no deal${x.reason ? `: ${x.reason}` : ""}`);
          } else {
            // Non-terminal after the promise resolved → treat as walked away so selection is consistent.
            updateRun(runId, (r) => {
              const y = r.negotiations.find((z) => z.id === n.id);
              if (y) {
                y.status = "walked_away";
                y.reason = y.reason ?? "Negotiation ended without a deal";
              }
            });
            addLog(runId, `🚶 ${x.vendorName} — no deal`);
          }
        })
        .catch((e) => console.error(`[orchestrator] post-negotiation log failed:`, e)),
    ),
  );
  const negSecs = Math.round((Date.now() - tNeg) / 1000);

  // ── selection ──
  const run = getRun(runId)!;
  const selections: Selection[] = [];
  const missingCats: Category[] = [];
  for (const category of spec.categories) {
    const all = run.negotiations.filter((n) => n.category === category);
    const deals = all.filter((n) => n.status === "deal" && typeof n.finalPrice === "number");
    if (!deals.length) {
      missingCats.push(category);
      addLog(runId, `⚠️ No deal landed for ${CATEGORY_LABELS[category]}`);
      continue;
    }
    deals.sort((a, b) => a.finalPrice! - b.finalPrice! || b.perks.length - a.perks.length);
    const best = deals[0];
    // Counter-rounds = vendor replies after the opening quote.
    const rounds = Math.max(0, best.messages.filter((m) => m.from === "vendor").length - 1);
    const bits: string[] = [
      deals.length > 1 ? `Lowest price of ${deals.length} deals` : "Only deal reached",
    ];
    if (rounds > 0) bits[0] += ` after ${rounds} round${rounds === 1 ? "" : "s"}`;
    else bits.push("accepted at opening quote");
    if (best.initialQuote && best.initialQuote > best.finalPrice!)
      bits.push(`${Math.round((1 - best.finalPrice! / best.initialQuote) * 100)}% below opening quote`);
    if (best.finalPrice! > best.maxPrice) bits.push(`over the ${usd(best.maxPrice)} allocation`);
    let rationale = bits.join(", ");
    if (best.perks.length) rationale += ` + ${best.perks.join(", ")}`;
    selections.push({ category, negotiationId: best.id, rationale });
    addLog(runId, `🏆 ${CATEGORY_LABELS[category]}: ${best.vendorName} — ${rationale}`);
  }

  const picked = selections.map((s) => run.negotiations.find((n) => n.id === s.negotiationId)!);
  const final = picked.reduce((s, n) => s + (n.finalPrice ?? 0), 0);
  const initial = picked.reduce((s, n) => s + (n.initialQuote ?? n.finalPrice ?? 0), 0);
  const totals = { initial, final, savings: initial - final };
  updateRun(runId, (r) => {
    r.selections = selections;
    r.totals = totals;
  });

  if (!selections.length) {
    updateRun(runId, (r) => {
      r.status = "failed";
      r.error = "No vendor agreed to a deal";
    });
    addLog(runId, "❌ No deals reached in any category");
    await notifyUser(
      runId,
      `😕 ${active.length} agents negotiated hard, but no vendor would meet your ${usdK(spec.budget)} budget. Want to try a higher budget or fewer guests?`,
    );
    return;
  }

  // ── awaiting approval ──
  const totalMsgs = run.negotiations.reduce((s, n) => s + n.messages.length, 0);
  const lines: string[] = [
    `✅ Negotiations done — ${active.length} agents, ${totalMsgs} messages, ${negSecs}s.`,
    "",
  ];
  for (const s of selections) {
    const n = picked.find((p) => p.id === s.negotiationId)!;
    let line = `${CATEGORY_EMOJI[s.category]} *${CATEGORY_LABELS[s.category]}*: ${n.vendorName} — ${usd(n.finalPrice!)}`;
    if (n.initialQuote && n.initialQuote > n.finalPrice!) line += ` (was ${usd(n.initialQuote)})`;
    if (s.category === "catering") {
      const d = dietarySummary(spec.dietary, "short");
      if (d) line += ` · covers ${d}`;
    }
    if (n.perks.length) line += ` + ${n.perks.slice(0, 2).join(", ")}`;
    lines.push(line);
  }
  for (const c of missingCats) lines.push(`${CATEGORY_EMOJI[c]} *${CATEGORY_LABELS[c]}*: no deal yet ⚠️`);
  lines.push("");
  const pct = totals.initial > 0 ? Math.round((totals.savings / totals.initial) * 100) : 0;
  let money = `💰 Total ${usd(totals.final)}`;
  if (totals.savings > 0) money += ` vs ${usd(totals.initial)} quoted — *saved ${usd(totals.savings)} (${pct}%)*.`;
  else money += ".";
  const delta = spec.budget - totals.final;
  money +=
    delta >= 0
      ? ` Under your ${usdK(spec.budget)} budget by ${usd(delta)}.`
      : ` ${usd(-delta)} over your ${usdK(spec.budget)} budget.`;
  lines.push(money, "", "Tap *Approve* (or reply *approve*) to book & issue Ramp virtual cards.");
  let summary = lines.join("\n");
  if (summary.length > 950) summary = summary.replace(/ \+ [^\n]*(?=\n)/g, ""); // drop perks if too long

  setStatus(runId, "awaiting_approval");
  addLog(runId, `⏳ Shortlist sent — ${usd(totals.final)} total, saved ${usd(Math.max(0, totals.savings))}. Awaiting approval. (${Math.round((Date.now() - t0) / 1000)}s end-to-end)`);
  await notifyUser(runId, summary, { approveButton: true });
}

// ───────────────────────────── approve ─────────────────────────────

export async function approveRun(runId: string): Promise<Run> {
  const run = getRun(runId);
  if (!run) throw new Error(`Run not found: ${runId}`);
  if (run.status !== "awaiting_approval")
    throw new Error(`Run ${runId} is not awaiting approval (status: ${run.status})`);
  if (approving.has(runId)) throw new Error(`Run ${runId} is already being approved`);
  approving.add(runId);
  try {
    addChat(runId, "user", "APPROVE");
    addLog(runId, "✍️ Approved by planner — issuing vendor-locked virtual cards…");
    const cards = await issueVirtualCards(runId);
    setStatus(runId, "approved");
    addLog(runId, `💳 Issued ${cards.length} virtual card${cards.length === 1 ? "" : "s"}`);
    const msg = cards.length
      ? `🎉 Booked! Issued ${cards.length} Ramp virtual card${cards.length === 1 ? "" : "s"}, each locked to one vendor:\n` +
        cards.map((c) => `• ${c.vendorName} — •••• ${c.last4} — ${usd(c.limit)} limit`).join("\n")
      : "🎉 Booked! Your vendors are confirmed.";
    await notifyUser(runId, msg);
    return getRun(runId)!;
  } finally {
    approving.delete(runId);
  }
}
