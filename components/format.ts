import type { Category, Negotiation, Run } from "@/lib/types";

export const usd = (n: number | undefined | null) =>
  n == null || Number.isNaN(n) ? "—" : "$" + Math.round(n).toLocaleString("en-US");

export const usdCompact = (n: number) =>
  n >= 1000 ? "$" + (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + "k" : usd(n);

export const pct = (from?: number, to?: number) =>
  from && to != null && from > 0 ? Math.max(0, Math.round(((from - to) / from) * 100)) : 0;

export const CATEGORIES: Category[] = ["venue", "catering", "av"];

export const CATEGORY_TINT: Record<Category, string> = {
  venue: "#d4ff3a",
  catering: "#5eead4",
  av: "#a78bfa",
};

export const isActive = (s: Run["status"]) =>
  s === "parsing" || s === "sourcing" || s === "negotiating";

export function formatDate(d: string) {
  const parsed = /^\d{4}-\d{2}-\d{2}/.test(d) ? new Date(d + "T12:00:00") : new Date(d);
  if (Number.isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export const clock = (ts: number) =>
  new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export function elapsed(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Best live price per category: selected deal if exists, else lowest live price among viable negotiations. */
export function bestPerCategory(run: Run): Partial<Record<Category, Negotiation>> {
  const out: Partial<Record<Category, Negotiation>> = {};
  for (const sel of run.selections) {
    const n = run.negotiations.find((x) => x.id === sel.negotiationId);
    if (n) out[sel.category] = n;
  }
  for (const n of run.negotiations) {
    if (out[n.category] && run.selections.some((s) => s.category === n.category)) continue;
    if (n.status === "disqualified" || n.status === "walked_away") continue;
    const price = n.finalPrice ?? n.currentPrice;
    if (price == null) continue;
    const cur = out[n.category];
    const curPrice = cur ? cur.finalPrice ?? cur.currentPrice ?? Infinity : Infinity;
    if (price < curPrice) out[n.category] = n;
  }
  return out;
}

export function liveTotals(run: Run) {
  if (run.totals) return { ...run.totals, partial: false };
  const best = bestPerCategory(run);
  let initial = 0;
  let final = 0;
  for (const n of Object.values(best)) {
    if (!n) continue;
    initial += n.initialQuote ?? 0;
    final += n.finalPrice ?? n.currentPrice ?? 0;
  }
  return { initial, final, savings: Math.max(0, initial - final), partial: true };
}
