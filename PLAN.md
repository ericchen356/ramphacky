# Haggle — event-planning agent swarm (hackathon MVP)

> **PIVOT: channel is now a Slack bot (Bolt, Socket Mode, started from `instrumentation.ts`), not WhatsApp.**
> Briefs come from `@Haggle` mentions, DMs, or `/haggle`; replies go in-thread; the shortlist has an
> "Approve & issue Ramp cards" button. WhatsApp sections below are superseded.

Planner texts WhatsApp: "120-person offsite in NYC Oct 20, $40k budget, 20 vegetarian, 5 gluten-free, 2 nut allergies".
An orchestrator agent parses the brief, a swarm of buyer agents negotiates **in parallel** with every matching
vendor (vendors are hardcoded but role-played live by their own Claude agents with hidden floor prices),
then the orchestrator picks the best deal per category and texts back a shortlist. Planner replies "APPROVE" →
Ramp-style virtual cards are issued, each locked to one vendor at the negotiated amount.

90-second pitch → the dashboard must look stunning: WhatsApp phone mock on the left, live swarm grid in the
center (every negotiation streaming, prices ticking down), savings/budget/dietary panel on the right.

## Architecture (single Next.js app, Node runtime, one process)

```
WhatsApp ─► POST /api/whatsapp (Twilio webhook) ─┐
Dashboard input ─► POST /api/runs ───────────────┼─► startRun()  lib/agents/orchestrator.ts
                                                 │      parse brief (Claude tool-use → EventSpec)
                                                 │      source vendors, disqualify (capacity/dietary)
                                                 │      spawn runNegotiation() for each vendor IN PARALLEL
                                                 │      select best per category, notifyUser(summary)
"APPROVE" ─► /api/whatsapp or /api/runs/:id/approve ─► approveRun() → issueVirtualCards()
                                                 │
lib/store.ts (in-memory, globalThis) ── every updateRun() emits Run snapshot ──► GET /api/stream (SSE) ─► UI
```

## Shared contracts (DO NOT change shapes; written by lead)
- `lib/types.ts` — all types.
- `lib/store.ts` — `createRun, getRun, listRuns, latestRun, updateRun, addLog, addChat, subscribe, uid`.
  ALL state mutations go through `updateRun` (it broadcasts). Never mutate a Run obtained from getRun outside updateRun.
- `lib/llm.ts` — `anthropic` client + `MODELS` (orchestrator/negotiator: claude-sonnet-5-5, vendor: claude-haiku-4-5-20251001).

## Module ownership + function contracts
| Module | Owner | Exports |
|---|---|---|
| `lib/vendors.ts` | negotiation agent | `VENDORS: Vendor[]`, `getVendor(id)`, `vendorsFor(category)`, `quoteTotal(vendor, headcount, perUnit)` |
| `lib/agents/vendor.ts`, `lib/agents/negotiate.ts` | negotiation agent | `runNegotiation(runId: string, negotiationId: string): Promise<void>` — reads run.spec + negotiation from store, runs buyer⇄vendor loop until terminal status (deal/walked_away), never throws (on error → walked_away w/ reason) |
| `lib/agents/orchestrator.ts` | orchestrator agent | `startRun(brief: string, opts?: { userPhone?: string }): Run` (returns immediately, pipeline continues async), `approveRun(runId: string): Promise<Run>`, `parseBrief(brief): Promise<EventSpec>` |
| `lib/notify.ts` | integrations agent | `notifyUser(runId, text): Promise<void>` — addChat(bot) + WhatsApp send if configured |
| `lib/finance.ts` | integrations agent | `issueVirtualCards(runId): Promise<VirtualCard[]>` |
| `app/api/**` | integrations agent | see API below |
| `app/page.tsx`, `app/layout.tsx`, `app/globals.css`, `components/**` | UI agent | dashboard |

## HTTP API
- `POST /api/runs` `{ brief: string }` → `{ run: Run }` (calls startRun)
- `GET /api/runs` → `{ runs: Run[] }`
- `POST /api/runs/[id]/approve` → `{ run: Run }` (calls approveRun)
- `GET /api/stream` — SSE. On connect: one `data: <Run JSON>` per existing run (oldest→newest), then every snapshot as it changes. Heartbeat comment every 15s.
- `POST /api/whatsapp` — Twilio webhook (form-encoded `Body`, `From`). "approve|yes|book it|👍" with an awaiting_approval run for that phone → approveRun; otherwise startRun(Body, { userPhone: From }). Responds immediately with empty TwiML `<Response></Response>`.

## Chat conventions (owned by orchestrator)
- startRun adds the user's brief as a `user` chat message, then `notifyUser` ack ("On it — deploying N agents…").
- When awaiting approval: notifyUser shortlist summary ending with "Reply APPROVE to book."
- approveRun adds a `user` chat message "APPROVE", issues cards, notifyUser confirmation listing cards.

## Demo env
`.env.local`: `ANTHROPIC_API_KEY`, optional `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` (e.g. `whatsapp:+14155238886`).
Demo city is NYC; vendors are NYC-based. Target: whole swarm finishes in ~45–75s.
