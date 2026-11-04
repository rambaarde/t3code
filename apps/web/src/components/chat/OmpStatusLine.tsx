/**
 * A one-line footer under the composer for OMP threads, like the OMP terminal's status line:
 * model, thinking level, context used, the last turn's tokens, and the branch.
 */
import { GitBranchIcon } from "lucide-react";
import type { ReactNode } from "react";

import type { ContextWindowSnapshot } from "../../lib/contextWindow";
import { cn } from "../../lib/utils";

/** "812", "26.3k", "1.2M": short enough for a status line. */
function formatStatusTokens(value: number): string {
  if (value < 1000) return String(value);
  if (value < 1_000_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}k`;
  return `${(value / 1_000_000).toFixed(1)}M`;
}

export function OmpStatusLine({
  modelLabel,
  effortLabel,
  contextWindow,
  sessionCostUsd,
  branch,
}: {
  readonly modelLabel: string | null;
  readonly effortLabel: string | null;
  readonly contextWindow: ContextWindowSnapshot | null;
  /** OMP's recorded session spend; null when the provider has not reported one. */
  readonly sessionCostUsd: number | null;
  readonly branch: string | null;
}) {
  const percent = contextWindow?.usedPercentage ?? null;
  // `optional` parts drop first when the composer is narrow, so the rest never truncate.
  const parts: Array<{ key: string; node: ReactNode; title?: string; optional?: boolean }> = [];
  if (modelLabel) parts.push({ key: "model", node: modelLabel });
  if (effortLabel)
    parts.push({ key: "effort", node: effortLabel, title: "Thinking level", optional: true });
  if (contextWindow) {
    const max = contextWindow.maxTokens;
    parts.push({
      key: "context",
      title: "Context used",
      node: (
        <span className={cn(percent !== null && percent > 90 && "text-destructive")}>
          {percent === null ? "" : `${Math.round(percent)}% · `}
          {formatStatusTokens(contextWindow.usedTokens)}
          {max ? `/${formatStatusTokens(max)}` : ""}
        </span>
      ),
    });
    const input = contextWindow.lastInputTokens ?? contextWindow.inputTokens ?? null;
    const cached = contextWindow.lastCachedInputTokens ?? contextWindow.cachedInputTokens ?? null;
    const output = contextWindow.lastOutputTokens ?? contextWindow.outputTokens ?? null;
    if (input !== null || output !== null) {
      parts.push({
        key: "tokens",
        title: "Last turn: input, cached input, output tokens",
        optional: true,
        node: [
          input === null ? null : `↑${formatStatusTokens(input)}`,
          cached === null || cached === 0 ? null : `⟳${formatStatusTokens(cached)}`,
          output === null ? null : `↓${formatStatusTokens(output)}`,
        ]
          .filter(Boolean)
          .join(" "),
      });
    }
  }
  if (sessionCostUsd !== null && sessionCostUsd > 0) {
    parts.push({
      key: "cost",
      title: "Session cost",
      node: `$${sessionCostUsd < 1 ? sessionCostUsd.toFixed(3) : sessionCostUsd.toFixed(2)}`,
    });
  }
  if (branch) {
    parts.push({
      key: "branch",
      title: "Branch",
      node: (
        <span className="inline-flex min-w-0 items-center gap-1">
          <GitBranchIcon aria-hidden className="size-3 shrink-0" />
          <span className="truncate">{branch}</span>
        </span>
      ),
    });
  }
  if (parts.length === 0) return null;
  return (
    <div
      data-omp-status-line
      className="@container flex min-w-0 items-center gap-1.5 overflow-hidden bg-background px-3 py-1 font-mono text-2xs whitespace-nowrap text-muted-foreground tabular-nums"
    >
      {parts.map((part, index) => (
        <span
          key={part.key}
          className={cn(
            "items-center gap-1.5",
            part.key === "branch" ? "flex min-w-0" : "shrink-0",
            part.optional ? "hidden @xl:flex" : part.key === "branch" ? "" : "flex",
          )}
        >
          {index > 0 ? (
            <span aria-hidden className="text-muted-foreground/50">
              ·
            </span>
          ) : null}
          <span className={part.key === "branch" ? "min-w-0 truncate" : undefined}>
            {part.title ? <span className="sr-only">{part.title}: </span> : null}
            {part.node}
          </span>
        </span>
      ))}
    </div>
  );
}
