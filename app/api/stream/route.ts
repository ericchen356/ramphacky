// Server-Sent Events feed of Run snapshots.
// On connect: one `data: <Run JSON>` per existing run (oldest → newest), then every snapshot as it changes.
import { listRuns, subscribe } from "@/lib/store";
import type { Run } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 15_000;

export async function GET(req: Request) {
  const encoder = new TextEncoder();
  let cleanup: () => void = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // Controller already closed/errored (client went away) — tear down.
          cleanup();
        }
      };
      const sendRun = (run: Run) => send(`data: ${JSON.stringify(run)}\n\n`);

      // Tell EventSource to retry quickly if the connection drops.
      send("retry: 2000\n\n");

      // Replay existing runs oldest → newest. listRuns() + this loop are synchronous, so no
      // snapshot can be emitted between the replay and the subscribe below.
      for (const run of [...listRuns()].reverse()) sendRun(run);

      const unsubscribe = subscribe(sendRun);
      const heartbeat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS);
      const onAbort = () => cleanup();

      cleanup = () => {
        if (closed) return;
        closed = true;
        unsubscribe();
        clearInterval(heartbeat);
        req.signal.removeEventListener("abort", onAbort);
        try {
          controller.close();
        } catch {
          // already closed / cancelled
        }
      };

      if (req.signal.aborted) cleanup();
      else req.signal.addEventListener("abort", onAbort);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
