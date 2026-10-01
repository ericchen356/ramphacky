import { Fragment, type ReactNode } from "react";

const TOKEN = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|`[^`\n]+`)/g;

function renderLine(line: string, key: number): ReactNode {
  const parts = line.split(TOKEN).filter((p) => p !== "");
  return (
    <Fragment key={key}>
      {parts.map((p, i) => {
        const inner = p.slice(1, -1);
        if (p.length > 2 && p.startsWith("*") && p.endsWith("*"))
          return <strong key={i} className="font-semibold text-white">{inner}</strong>;
        if (p.length > 2 && p.startsWith("_") && p.endsWith("_"))
          return <em key={i}>{inner}</em>;
        if (p.length > 2 && p.startsWith("~") && p.endsWith("~"))
          return <s key={i} className="opacity-55">{inner}</s>;
        if (p.length > 2 && p.startsWith("`") && p.endsWith("`"))
          return <code key={i} className="rounded border border-white/10 bg-white/[0.06] px-1 py-px font-mono text-[0.86em] text-[#e8912d]">{inner}</code>;
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </Fragment>
  );
}

/** Renders Slack mrkdwn: *bold*, _italic_, ~strike~, `code`, newlines, • bullets. */
export default function Mrkdwn({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((l, i) => {
        const bullet = /^\s*[•\-*]\s+/.exec(l);
        if (bullet && !/^\s*\*[^*]+\*/.test(l)) {
          return (
            <span key={i} className="flex gap-2 pl-1">
              <span className="select-none text-white/50">•</span>
              <span className="min-w-0 flex-1">{renderLine(l.slice(bullet[0].length), i)}</span>
            </span>
          );
        }
        return (
          <Fragment key={i}>
            {renderLine(l, i)}
            {i < lines.length - 1 && !/^\s*[•\-]\s+/.test(lines[i + 1] ?? "") && <br />}
          </Fragment>
        );
      })}
    </>
  );
}
