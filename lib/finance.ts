// Ramp-style virtual card issuer.
// For each selected vendor whose negotiation closed as a "deal", issue one single-vendor virtual card
// with a spend limit locked to the negotiated finalPrice. Cards are written to run.cards via updateRun.
//
// Structure: issueCard() is the single swap point for a real card-issuing API. Today it always
// mints a mock card; when RAMP_API_KEY is set there is a TODO branch for the live Ramp call.
import { getRun, uid, updateRun } from "./store";
import type { Category, Negotiation, VirtualCard } from "./types";

const CARD_ISSUE_DELAY_MS = 300;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const randomLast4 = () =>
  Math.floor(Math.random() * 10_000)
    .toString()
    .padStart(4, "0");

interface CardRequest {
  runId: string;
  vendorName: string;
  category: Category;
  limit: number; // USD
}

function mockIssueCard(req: CardRequest): VirtualCard {
  return {
    id: uid("card_"),
    vendorName: req.vendorName,
    category: req.category,
    last4: randomLast4(),
    limit: req.limit,
    status: "active",
  };
}

async function issueCard(req: CardRequest): Promise<VirtualCard> {
  if (process.env.RAMP_API_KEY) {
    // TODO(ramp-live): swap in the real Ramp API here, e.g.
    //   POST https://api.ramp.com/developer/v1/limits/deferred (or /cards/deferred/virtual)
    //   with { display_name: `${req.vendorName} – ${req.category}`, spending_restrictions:
    //   { amount: req.limit * 100, interval: "TOTAL", allowed_merchants/categories... } }
    //   using an OAuth client-credentials token derived from RAMP_API_KEY, then map the
    //   response (id, last_four) onto VirtualCard. Not wired for the hackathon — fall through to mock.
  }
  return mockIssueCard(req);
}

export async function issueVirtualCards(runId: string): Promise<VirtualCard[]> {
  const run = getRun(runId);
  if (!run) throw new Error(`Run not found: ${runId}`);

  const byId = new Map<string, Negotiation>(run.negotiations.map((n) => [n.id, n]));
  const requests: CardRequest[] = [];
  for (const sel of run.selections) {
    const neg = byId.get(sel.negotiationId);
    if (!neg || neg.status !== "deal") continue;
    const limit = neg.finalPrice ?? neg.currentPrice;
    if (limit == null || !Number.isFinite(limit) || limit <= 0) continue;
    requests.push({
      runId,
      vendorName: neg.vendorName,
      category: sel.category ?? neg.category,
      limit: Math.round(limit * 100) / 100,
    });
  }

  const issued: VirtualCard[] = [];
  for (const req of requests) {
    await sleep(CARD_ISSUE_DELAY_MS); // UI drama: cards appear one by one
    const card = await issueCard(req);
    issued.push(card);
    updateRun(runId, (r) => {
      r.cards.push(card);
    });
  }
  return issued;
}
