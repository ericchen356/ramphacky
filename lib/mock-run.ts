// Client-side mock: a realistic fixture + a simulator that animates a fake run through every status.
// Enabled in the dashboard with `?mock=1` (add `&auto=1` to auto-start + auto-approve).
// Types only — no server imports.
import type {
  Category,
  EventSpec,
  Negotiation,
  NegotiationMessage,
  Run,
  VirtualCard,
} from "./types";

export const SAMPLE_BRIEF =
  "Planning our Q4 sales offsite in NYC on Oct 20 for 120 people, budget $45k. 20 vegetarian, 6 gluten-free, 2 nut allergies. Need venue, catering and AV.";

const SPEC: EventSpec = {
  title: "Q4 Sales Offsite",
  headcount: 120,
  city: "New York, NY",
  date: "2026-10-20",
  budget: 45000,
  categories: ["venue", "catering", "av"],
  dietary: { vegetarian: 20, vegan: 0, glutenFree: 6, nutAllergy: 2, halal: 0, kosher: 0 },
  notes: "Full-day offsite. Needs main stage + breakout space.",
};

interface MockVendor {
  id: string;
  name: string;
  emoji: string;
  category: Category;
  initial: number;
  agent: number[]; // buyer counter-offers
  vendor: number[]; // vendor concessions after the opening quote
  outcome: "deal" | "walked_away" | "disqualified";
  reason?: string;
  includes: string;
  flavor: string[];
  perk?: string;
  speed: number; // seconds between turns (base)
}

const VENDORS: MockVendor[] = [
  // ── Venue
  {
    id: "foundry", name: "The Foundry", emoji: "🏭", category: "venue",
    initial: 24000, agent: [16500, 17800], vendor: [21000, 18400], outcome: "deal",
    includes: "the main hall, two breakout rooms and the courtyard",
    flavor: ["We've had a lot of interest for October, but I hear you.", "Tuesdays are a bit softer for us — I can meet you there."],
    perk: "Rooftop terrace for the reception", speed: 2.6,
  },
  {
    id: "convene", name: "Convene Hudson Yards", emoji: "🏙️", category: "venue",
    initial: 28500, agent: [20000, 21500], vendor: [25200, 22800], outcome: "deal",
    includes: "the Summit room, in-house AV booth and all-day coffee",
    flavor: ["Our pricing is fairly standardized, but let me check with my GM.", "GM approved a one-time adjustment for a weekday booking."],
    perk: "Complimentary espresso bar", speed: 3.1,
  },
  {
    id: "spring", name: "Spring Studios", emoji: "🌆", category: "venue",
    initial: 31000, agent: [21000, 23500], vendor: [29500, 27500], outcome: "walked_away",
    reason: "Vendor floor $27,500 is above our $24,000 ceiling",
    includes: "the full 8th floor with skyline terrace",
    flavor: ["Spring Studios is a premium space — we rarely discount.", "$27,500 is genuinely the lowest I can go."],
    speed: 3.4,
  },
  {
    id: "greenhouse", name: "The Greenhouse Loft", emoji: "🪴", category: "venue",
    initial: 15000, agent: [], vendor: [], outcome: "disqualified",
    reason: "Max capacity 80 — event needs 120", includes: "", flavor: [], speed: 3,
  },
  // ── Catering
  {
    id: "greatperf", name: "Great Performances", emoji: "🥗", category: "catering",
    initial: 11400, agent: [7800, 8400], vendor: [9900, 8640], outcome: "deal",
    includes: "breakfast, a plated lunch and afternoon snacks at $95/person",
    flavor: ["Happy to work with you. Our veg and GF menus are fully separate.", "If we can lock the menu by Friday I can do $72 a head."],
    perk: "Free dessert station", speed: 2.4,
  },
  {
    id: "pinch", name: "Pinch Food Design", emoji: "🍱", category: "catering",
    initial: 13200, agent: [9600, 10400], vendor: [11880, 10800], outcome: "deal",
    includes: "chef-attended stations and passed bites at $110/person",
    flavor: ["Our stations are a showpiece — but there's some room.", "Final answer: $90/person and we upgrade the passed apps."],
    perk: "Upgraded passed apps", speed: 3.0,
  },
  {
    id: "tacombi", name: "Tacombi Catering", emoji: "🌮", category: "catering",
    initial: 10200, agent: [8000, 8600], vendor: [9600, 9240], outcome: "deal",
    includes: "a taco bar with full veg + GF options at $85/person",
    flavor: ["We can flex a little on the protein mix.", "$77/person is where I land — includes horchata service."],
    perk: "Horchata + agua fresca bar", speed: 2.8,
  },
  {
    id: "smoke", name: "Smoke & Barrel BBQ", emoji: "🍖", category: "catering",
    initial: 8400, agent: [], vendor: [], outcome: "disqualified",
    reason: "No vegetarian or certified gluten-free menu", includes: "", flavor: [], speed: 3,
  },
  // ── AV
  {
    id: "lightwave", name: "Lightwave AV", emoji: "🎛️", category: "av",
    initial: 9800, agent: [6800, 7200], vendor: [8400, 7400], outcome: "deal",
    includes: "2 LED walls, 6 wireless mics, a 2-person crew and confidence monitors",
    flavor: ["We can trim the second LED wall to a projector if you're flexible.", "Keep both walls — I'll do $7,400 if you sign today."],
    perk: "Free livestream setup", speed: 2.2,
  },
  {
    id: "stagecraft", name: "Stagecraft NYC", emoji: "🎤", category: "av",
    initial: 12500, agent: [8000, 9000], vendor: [10800, 9900], outcome: "deal",
    includes: "full stage build, line array audio and a 3-person crew",
    flavor: ["Our crew is union and our gear is top-tier.", "I can sharpen to $9,900 — that's my best."],
    perk: "Teleprompter included", speed: 3.3,
  },
  {
    id: "brightpixel", name: "Bright Pixel Productions", emoji: "📽️", category: "av",
    initial: 8900, agent: [6500, 7400], vendor: [8200, 7900], outcome: "deal",
    includes: "projection, PA system and one technician",
    flavor: ["We're already pretty lean on price.", "OK — $7,900 with an extra lav mic."],
    perk: "Extra lavalier mic", speed: 2.9,
  },
  {
    id: "soundhouse", name: "SoundHouse Pro", emoji: "🔊", category: "av",
    initial: 11000, agent: [7500, 8200], vendor: [9600, 8600], outcome: "deal",
    includes: "premium audio, stage wash lighting and a 2-person crew",
    flavor: ["That's a big gap, but October 20 is open for us.", "$8,600 and we'll handle load-in the night before."],
    perk: "Free night-before load-in", speed: 3.0,
  },
];

const SCOPE: Record<Category, string> = {
  venue: "a full-day venue rental",
  catering: "breakfast, lunch and snacks for 120",
  av: "full AV for a main-stage session + 2 breakouts",
};

const usd = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let idCounter = 0;
const mid = (p: string) => `${p}${(++idCounter).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

type Step = { at: number; apply: (run: Run, now: number) => void };

const SELECTED: Record<Category, string> = { venue: "foundry", catering: "greatperf", av: "lightwave" };
const RATIONALE: Record<Category, string> = {
  venue: "Lowest price with capacity for 120 + rooftop reception thrown in.",
  catering: "Best price that covers every dietary need with separate veg/GF prep.",
  av: "Cheapest full package; free livestream adds remote-team reach.",
};

/** Build the timed script for a run. Times are in seconds from start. */
function buildScript(runId: string): { steps: Step[]; end: number } {
  const rand = mulberry32(42);
  const steps: Step[] = [];
  const negId = (v: MockVendor) => `${runId}_${v.id}`;
  const neg = (run: Run, v: MockVendor) => run.negotiations.find((n) => n.id === negId(v))!;
  const log = (at: number, text: string) =>
    steps.push({ at, apply: (r, now) => r.log.push({ ts: now, text }) });
  const bot = (at: number, text: string) =>
    steps.push({ at, apply: (r, now) => r.chat.push({ id: mid("c_"), from: "bot", text, ts: now }) });

  log(0.2, "📨 Brief received in #event-planning — parsing with Claude…");
  steps.push({
    at: 1.6,
    apply: (r) => {
      r.spec = structuredClone(SPEC);
      r.status = "sourcing";
    },
  });
  log(1.6, "🧠 Spec: Q4 Sales Offsite · 120 guests · NYC · Oct 20 · $45,000");
  log(1.9, "🥗 Dietary: 20 vegetarian · 6 gluten-free · 2 nut allergies");
  bot(
    2.2,
    "On it! 🧠 Here's what I got:\n*Q4 Sales Offsite* · 120 guests · NYC · Oct 20\nBudget: *$45,000*\n\nDeploying *12 agents* to negotiate with venues, caterers and AV vendors in parallel. Sit tight ⚡",
  );
  log(2.6, "🔎 Sourcing NYC vendors — 4 venues, 4 caterers, 4 AV crews");

  steps.push({
    at: 3.0,
    apply: (r) => {
      r.negotiations = VENDORS.map<Negotiation>((v) => ({
        id: negId(v),
        runId,
        vendorId: v.id,
        vendorName: v.name,
        vendorEmoji: v.emoji,
        category: v.category,
        status: "queued",
        targetPrice: Math.round((v.initial * 0.72) / 100) * 100,
        maxPrice: v.id === "spring" ? 24000 : Math.round((v.initial * 0.92) / 100) * 100,
        perks: [],
        messages: [],
      }));
    },
  });

  // Disqualifications
  for (const [i, v] of VENDORS.filter((x) => x.outcome === "disqualified").entries()) {
    const at = 3.8 + i * 0.5;
    steps.push({
      at,
      apply: (r) => {
        const n = neg(r, v);
        n.status = "disqualified";
        n.reason = v.reason;
      },
    });
    log(at, `⛔ Disqualified ${v.name} — ${v.reason}`);
  }
  log(4.9, "🚀 Deploying 10 negotiator agents in parallel");
  steps.push({ at: 5.0, apply: (r) => (r.status = "negotiating") });

  let end = 0;
  const active = VENDORS.filter((v) => v.outcome !== "disqualified");
  active.forEach((v, i) => {
    let t = 5.2 + i * 0.45;
    const push = (from: NegotiationMessage["from"], text: string, offer?: number, after?: (n: Negotiation) => void) => {
      const at = t;
      steps.push({
        at,
        apply: (r, now) => {
          const n = neg(r, v);
          n.messages.push({ id: mid("m_"), from, text, offer, ts: now });
          if (offer != null && from === "vendor") {
            n.initialQuote ??= offer;
            n.currentPrice = offer;
          }
          if (n.status === "contacting" && from === "vendor") n.status = "negotiating";
          after?.(n);
        },
      });
      t += v.speed * (0.75 + rand() * 0.6);
    };

    steps.push({ at: t - 0.2, apply: (r) => (neg(r, v).status = "contacting") });
    push(
      "agent",
      `Hi ${v.name} 👋 I'm buying on behalf of a 120-person sales offsite on Oct 20 in NYC. Could you share your best all-in price for ${SCOPE[v.category]}?`,
    );
    push("vendor", `Thanks for reaching out! For 120 guests we'd be at ${usd(v.initial)}, which covers ${v.includes}.`, v.initial);
    push(
      "agent",
      `Appreciate it. We're comparing ${active.filter((x) => x.category === v.category).length} quotes and the competitive range is closer to ${usd(v.agent[0])}. Can you get there if we confirm this week?`,
      v.agent[0],
    );
    push("vendor", `${v.flavor[0]} I can come down to ${usd(v.vendor[0])}.`, v.vendor[0]);
    push(
      "agent",
      `We're close. ${usd(v.agent[1])} and we sign today${v.outcome === "deal" ? " — any chance you can add something for the team?" : "."}`,
      v.agent[1],
    );
    if (v.outcome === "deal") {
      const final = v.vendor[1];
      push("vendor", `${v.flavor[1]} ${usd(final)}, and we'll include: ${v.perk}. Deal?`, final);
      push("agent", `Deal at ${usd(final)} ✅ Locking it in — card details to follow on approval.`, final, (n) => {
        n.status = "deal";
        n.finalPrice = final;
        n.currentPrice = final;
        if (v.perk) n.perks = [v.perk];
      });
      const pct = Math.round(((v.initial - final) / v.initial) * 100);
      log(t - 0.4, `✅ ${v.name} closed at ${usd(final)} (−${pct}% vs ${usd(v.initial)})`);
    } else {
      push("vendor", v.flavor[1], v.vendor[1]);
      push("agent", `Understood — that's above our ceiling for this event, so we'll pass. Thanks for your time!`, undefined, (n) => {
        n.status = "walked_away";
        n.reason = v.reason;
      });
      log(t - 0.4, `🚶 Walked away from ${v.name} — ${v.reason}`);
    }
    end = Math.max(end, t);
  });

  // Selection + shortlist
  const sel = (c: Category) => VENDORS.find((v) => v.id === SELECTED[c])!;
  const initialTotal = (["venue", "catering", "av"] as Category[]).reduce((s, c) => s + sel(c).initial, 0);
  const finalTotal = (["venue", "catering", "av"] as Category[]).reduce((s, c) => s + sel(c).vendor[1], 0);
  log(end + 0.3, "🧮 All negotiations settled — ranking deals per category");
  steps.push({
    at: end + 1.4,
    apply: (r) => {
      r.selections = (["venue", "catering", "av"] as Category[]).map((c) => ({
        category: c,
        negotiationId: `${runId}_${SELECTED[c]}`,
        rationale: RATIONALE[c],
      }));
      r.totals = { initial: initialTotal, final: finalTotal, savings: initialTotal - finalTotal };
    },
  });
  log(end + 1.4, `🏆 Shortlist: ${usd(finalTotal)} total · ${usd(initialTotal - finalTotal)} saved`);
  const deals = active.filter((v) => v.outcome === "deal").length;
  steps.push({ at: end + 2.0, apply: (r) => (r.status = "awaiting_approval") });
  bot(
    end + 2.0,
    `✅ *Negotiations complete* — ${active.length} vendors, ${deals} deals closed.\n\n` +
      `🏭 *Venue:* The Foundry — ${usd(sel("venue").vendor[1])} ~${usd(sel("venue").initial)}~\n` +
      `🥗 *Catering:* Great Performances — ${usd(sel("catering").vendor[1])} ~${usd(sel("catering").initial)}~\n` +
      `🎛️ *AV:* Lightwave AV — ${usd(sel("av").vendor[1])} ~${usd(sel("av").initial)}~\n\n` +
      `*Total: ${usd(finalTotal)}* — saved ${usd(initialTotal - finalTotal)} (${Math.round(((initialTotal - finalTotal) / initialTotal) * 100)}%), ${usd(SPEC.budget - finalTotal)} under budget.\n\n` +
      `Reply *APPROVE* to book.`,
  );
  log(end + 2.0, "📲 Shortlist sent to planner — awaiting approval");
  return { steps: steps.sort((a, b) => a.at - b.at), end: end + 2.0 };
}

function buildApproveScript(runId: string): Step[] {
  const steps: Step[] = [];
  const last4 = ["4821", "7390", "1056"];
  steps.push({
    at: 0,
    apply: (r, now) => {
      r.chat.push({ id: mid("c_"), from: "user", text: "APPROVE", ts: now });
      r.log.push({ ts: now, text: "👍 Planner approved — issuing single-vendor virtual cards" });
    },
  });
  (["venue", "catering", "av"] as Category[]).forEach((c, i) => {
    steps.push({
      at: 1.0 + i * 0.7,
      apply: (r, now) => {
        const n = r.negotiations.find((x) => x.id === `${runId}_${SELECTED[c]}`)!;
        const card: VirtualCard = {
          id: mid("card_"),
          vendorName: n.vendorName,
          category: c,
          last4: last4[i],
          limit: n.finalPrice ?? 0,
          status: "active",
        };
        r.cards.push(card);
        r.log.push({ ts: now, text: `💳 Card •••• ${card.last4} → ${card.vendorName}, limit ${usd(card.limit)}` });
      },
    });
  });
  steps.push({
    at: 3.2,
    apply: (r, now) => {
      r.status = "approved";
      r.chat.push({
        id: mid("c_"),
        from: "bot",
        text:
          "🎉 *Booked!* I issued 3 virtual cards, each locked to one vendor at the negotiated amount:\n\n" +
          r.cards.map((c) => `💳 ${c.vendorName} •••• ${c.last4} — *${usd(c.limit)}*`).join("\n") +
          "\n\nConfirmations are on their way. Enjoy the offsite! 🥂",
        ts: now,
      });
      r.log.push({ ts: now, text: "🎉 All vendors booked — run complete" });
    },
  });
  return steps;
}

function newRun(brief: string): Run {
  const now = Date.now();
  return {
    id: mid("run_mock_"),
    createdAt: now,
    brief,
    status: "parsing",
    negotiations: [],
    selections: [],
    chat: [{ id: mid("c_"), from: "user", text: brief, ts: now }],
    cards: [],
    log: [],
  };
}

/** A fully-negotiated run, frozen at `awaiting_approval` (or `approved` if `approved: true`). */
export function mockFixture(opts: { approved?: boolean } = {}): Run {
  const run = newRun(SAMPLE_BRIEF);
  const t0 = run.createdAt - 60_000;
  run.createdAt = t0;
  run.chat[0].ts = t0;
  const { steps } = buildScript(run.id);
  for (const s of steps) s.apply(run, t0 + s.at * 1000);
  if (opts.approved) {
    const a0 = t0 + 70_000;
    for (const s of buildApproveScript(run.id)) s.apply(run, a0 + s.at * 1000);
  }
  return run;
}

export interface MockSimulator {
  start(brief?: string): Run;
  /** Approve a run started by this simulator, or adopt a snapshot (e.g. a fixture) and approve it. */
  approve(run: string | Run): void;
  stop(): void;
}

/** Animates fake runs in the browser. `onUpdate` receives a fresh snapshot after every change. */
export function createMockSimulator(onUpdate: (run: Run) => void, opts: { speed?: number } = {}): MockSimulator {
  const speed = opts.speed ?? 1;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const runs = new Map<string, Run>();

  const schedule = (run: Run, steps: Step[]) => {
    for (const s of steps) {
      const h = setTimeout(() => {
        timers.delete(h);
        s.apply(run, Date.now());
        onUpdate(structuredClone(run));
      }, (s.at * 1000) / speed);
      timers.add(h);
    }
  };

  return {
    start(brief = SAMPLE_BRIEF) {
      const run = newRun(brief);
      runs.set(run.id, run);
      onUpdate(structuredClone(run));
      schedule(run, buildScript(run.id).steps);
      return structuredClone(run);
    },
    approve(target) {
      let run = typeof target === "string" ? runs.get(target) : runs.get(target.id);
      if (!run && typeof target !== "string") {
        run = structuredClone(target);
        runs.set(run.id, run);
      }
      if (!run || run.status !== "awaiting_approval") return;
      schedule(run, buildApproveScript(run.id));
    },
    stop() {
      timers.forEach(clearTimeout);
      timers.clear();
    },
  };
}
