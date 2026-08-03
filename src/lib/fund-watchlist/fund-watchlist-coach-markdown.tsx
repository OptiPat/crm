import type { ReactNode } from "react";

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={`${keyPrefix}-b-${index}`} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={`${keyPrefix}-t-${index}`}>{part}</span>;
  });
}

export function FundWatchlistCoachMarkdown({ markdown }: { markdown: string }) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let listItems: ReactNode[] = [];
  let listKey = 0;

  const flushList = () => {
    if (listItems.length === 0) return;
    blocks.push(
      <ul key={`ul-${listKey++}`} className="my-2 list-disc space-y-1 pl-5">
        {listItems}
      </ul>
    );
    listItems = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    if (trimmed === "") {
      flushList();
      continue;
    }

    if (trimmed === "---" || trimmed === "***") {
      flushList();
      blocks.push(<hr key={`hr-${i}`} className="my-4 border-border" />);
      continue;
    }

    if (trimmed.startsWith("#### ")) {
      flushList();
      blocks.push(
        <h4 key={`h4-${i}`} className="mt-3 mb-1.5 text-sm font-semibold">
          {renderInline(trimmed.slice(5), `h4-${i}`)}
        </h4>
      );
      continue;
    }

    if (trimmed.startsWith("### ")) {
      flushList();
      blocks.push(
        <h3 key={`h3-${i}`} className="mt-4 mb-2 text-base font-semibold">
          {renderInline(trimmed.slice(4), `h3-${i}`)}
        </h3>
      );
      continue;
    }

    if (trimmed.startsWith("## ")) {
      flushList();
      blocks.push(
        <h2 key={`h2-${i}`} className="mt-5 mb-2 text-lg font-semibold">
          {renderInline(trimmed.slice(3), `h2-${i}`)}
        </h2>
      );
      continue;
    }

    if (trimmed.startsWith("# ")) {
      flushList();
      blocks.push(
        <h1 key={`h1-${i}`} className="mt-5 mb-3 text-xl font-bold">
          {renderInline(trimmed.slice(2), `h1-${i}`)}
        </h1>
      );
      continue;
    }

    if (trimmed.startsWith("> ")) {
      flushList();
      blocks.push(
        <blockquote
          key={`bq-${i}`}
          className="my-2 border-l-2 border-primary/40 pl-3 text-muted-foreground italic"
        >
          {renderInline(trimmed.slice(2), `bq-${i}`)}
        </blockquote>
      );
      continue;
    }

    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      listItems.push(
        <li key={`li-${i}`}>{renderInline(trimmed.slice(2), `li-${i}`)}</li>
      );
      continue;
    }

    flushList();
    blocks.push(
      <p key={`p-${i}`} className="my-2 leading-relaxed">
        {renderInline(trimmed, `p-${i}`)}
      </p>
    );
  }

  flushList();

  return <div className="text-sm">{blocks}</div>;
}
