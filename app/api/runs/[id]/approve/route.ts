import { approveRun } from "@/lib/agents/orchestrator";
import { getRun } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Next 16: route params are a Promise and must be awaited.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const existing = getRun(id);
  if (!existing) {
    return Response.json({ error: `Run not found: ${id}` }, { status: 404 });
  }
  if (existing.status !== "awaiting_approval") {
    return Response.json(
      { error: `Run ${id} is not awaiting approval (status: ${existing.status})` },
      { status: 409 },
    );
  }

  try {
    const run = await approveRun(id);
    return Response.json({ run });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to approve run";
    console.error(`[api/runs/${id}/approve] approveRun failed:`, err);
    // approveRun throws when the run isn't awaiting approval or a concurrent approve is in flight.
    const current = getRun(id);
    const conflict =
      /not awaiting approval|already being approved/i.test(message) ||
      (current !== undefined && current.status !== "awaiting_approval" && current.status !== "approved");
    const status = !current ? 404 : conflict ? 409 : 500;
    return Response.json({ error: message }, { status });
  }
}
