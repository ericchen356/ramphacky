# Haggle — Your events, negotiated by a swarm

## One-liner
Haggle is a Slack bot that plans events for you. Describe the event in one message, and a swarm of AI agents contacts every relevant vendor, negotiates prices **in parallel**, and comes back with the best deal per category — ready to book with one click and pay with vendor-locked Ramp virtual cards.

## The problem
Event planning is mostly grunt work:
- Finding venues, caterers, and AV vendors that fit headcount, date, and budget
- Requesting quotes from each one and waiting on replies
- Haggling back and forth, vendor by vendor
- Tracking dietary restrictions and checking which caterers can actually serve them
- Comparing apples-to-oranges quotes and managing spend

High-level planners spend hours on logistics instead of on the event itself.

## The solution
A planner types into Slack:

> @Haggle Planning our Q4 sales offsite in NYC on Oct 20 for 120 people, budget $45k. 20 vegetarian, 6 gluten-free, 2 nut allergies. Need venue, catering and AV.

Within about a minute, Haggle:
1. **Understands the brief**: extracts headcount, city, date, budget, categories, and dietary needs.
2. **Sources vendors**: matches venues, caterers, and AV providers, and automatically disqualifies ones that can't fit (venue too small, caterer can't do gluten-free).
3. **Deploys a negotiation swarm**: one buyer agent per vendor, all negotiating at the same time.
4. **Uses swarm leverage**: each agent sees the live quotes the *other* agents are getting ("Hudson Yards Hall just quoted $16,400…") and uses them to push prices down.
5. **Picks the winners**: the best deal per category, with perks won (free AV hookup, extended hours, dessert station…).
6. **Reports back in Slack**: a shortlist with total savings and budget headroom, plus an **Approve** button.
7. **Books and pays**: on approval, it issues one **Ramp virtual card per vendor**, locked to the negotiated amount, so no vendor can overcharge.

## Demo results (live, real Claude agents)
| Metric | Result |
|---|---|
| Brief → shortlist | ~40 seconds |
| Agents deployed | 10 in parallel (2 vendors auto-disqualified) |
| Messages exchanged | ~110 |
| Total | $26,450 vs $31,840 quoted, **saved 17%** |
| Budget | $18.5k under the $45k budget |
| Perks won | Free AV hookup, extended hours, event captain, dessert station, … |
| Cards issued | 3 vendor-locked virtual cards |

## Main ideas
- **Swarm over sequence:** a human negotiates with one vendor at a time; Haggle negotiates with all of them at once, and every negotiation strengthens the others.
- **Agents negotiate like people:** short, natural, polite but firm messages. They counter, cite competing quotes, ask for perks instead of only price cuts, and walk away when a vendor won't budge.
- **Human stays in control:** agents never commit money. Nothing is booked until the planner clicks Approve.
- **Hard guardrails in code, not just prompts:**
  - Buyer agents can never offer above the category budget ceiling.
  - Offers only move in one direction (buyer up, vendor down).
  - Agents only cite real competing quotes, never invented ones.
- **Spend control built in:** Ramp virtual cards are single-vendor and capped at the negotiated price, which turns negotiation into enforced spend policy.
- **Lives where teams already work:** Slack threads, mentions, DMs, and `/haggle`.

## Product surface
### Slack bot
- Triggers: `@Haggle <brief>` in a channel, a DM to Haggle, or `/haggle <brief>`
- Replies in-thread: an acknowledgment, then the shortlist
- Shortlist message has **✅ Approve & issue Ramp cards** and **View live dashboard** buttons
- Replying "approve" in the thread also works

### Live dashboard (the "mission control" view)
- **Left: Slack panel.** The conversation, mirrored live.
- **Center: Agent Swarm.** A card for every vendor negotiation, with live status, prices ticking down, % saved, an offer-history sparkline, and the latest message. Click a card for the full agent ↔ vendor transcript. Winners glow.
- **Right: Deal Room.** Event spec, animated savings counter, budget bar, dietary coverage, the orchestrator's live "thoughts", and the issued virtual cards.

## How it works
```
Slack (@Haggle / DM / /haggle)
        │  Socket Mode (no public URL needed)
        ▼
Orchestrator agent (Claude)
  parse brief → event spec → budget split → source & disqualify vendors
        │
        ├─► Buyer agent ⇄ Vendor agent   (venue #1)
        ├─► Buyer agent ⇄ Vendor agent   (venue #2)
        ├─► Buyer agent ⇄ Vendor agent   (catering #1)   … all in parallel
        └─► …                            (AV #n)
        │        ▲ shared live state: every agent sees competitors' quotes
        ▼
Selection → Slack shortlist → Approve → Ramp virtual cards
        │
Live state stream (SSE) → Dashboard
```

### Agents
| Agent | Model | Role |
|---|---|---|
| Orchestrator | Claude Sonnet 5.5 | Parses the brief, allocates budget, deploys the swarm, selects winners, talks to the planner |
| Buyer (×N) | Claude Sonnet 5.5 | Negotiates with one vendor toward a target price within a hard ceiling |
| Vendor (×N) | Claude Haiku 4.5 | Role-plays each vendor's rep with its own personality and a hidden lowest price (demo only) |

### Demo vendor set
12 NYC vendors (4 venues, 4 caterers, 4 AV) with distinct personalities (stubborn premium rooftop, flexible loft that trades perks, budget AV shop, and so on), real-feeling pricing, capacities, and dietary capabilities. Vendor *data* is hardcoded for the demo, but every negotiation is live and unscripted.

## Tech stack
- **App:** Next.js 16 (App Router), TypeScript, Tailwind v4, Framer Motion
- **AI:** Anthropic Claude API (tool use for structured actions)
- **Chat:** Slack Bolt (Socket Mode), Block Kit buttons
- **Payments:** Ramp-style virtual card issuance (mocked; the swap point for the live Ramp API is in `lib/finance.ts`)
- **State:** in-memory store with a live SSE stream to the dashboard

## Running it
```bash
npm install
# .env.local: ANTHROPIC_API_KEY, SLACK_BOT_TOKEN (xoxb-), SLACK_APP_TOKEN (xapp-)
npm run dev
```
- Dashboard: `http://localhost:3000`
- Offline backup demo: `http://localhost:3000/?mock=1&auto=1`
- Headless full run: `npx tsx --env-file=.env.local scripts/demo.ts`

## What's next (post-hackathon)
- **Real vendor outreach:** email (and voice calls) to real vendors, with AI disclosure
- **Live Ramp API:** real virtual cards, spend limits, and receipt matching
- **More categories:** photography, transport, hotels, swag, entertainment
- **Attendee dietary collection:** an RSVP form that feeds requirements to caterers automatically
- **Contracts:** summarize vendor contracts and flag hidden fees before approval
- **Memory:** learn preferred vendors and past prices across events

## 90-second pitch outline
1. **Hook (10s):** "Planning a 120-person offsite means days of emailing vendors and haggling over prices."
2. **Live demo (60s):** Type the brief into Slack → watch the swarm negotiate on the dashboard → shortlist arrives saving 17% → click Approve → Ramp cards appear.
3. **Close (20s):** "Haggle turns days of grunt work into one Slack message and 40 seconds, with spend controls built in."
