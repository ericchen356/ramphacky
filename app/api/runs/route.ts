import { startRun } from "@/lib/agents/orchestrator";
import { listRuns } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ runs: listRuns() });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const brief =
    body && typeof body === "object" && "brief" in body && typeof body.brief === "string"
      ? body.brief.trim()
      : "";
  if (!brief) {
    return Response.json({ error: "`brief` is required" }, { status: 400 });
  }

  try {
    const run = startRun(brief);
    return Response.json({ run });
  } catch (err) {
    console.error("[api/runs] startRun failed:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to start run" },
      { status: 500 },
    );
  }
}
