import type { ReactNode } from "react";

import { Spinner } from "../ui/spinner";

import { cn } from "~/lib/utils";

export function AgentThinkingIndicator({
  active = true,
  elapsed,
  label,
  subtle = false,
}: {
  active?: boolean;
  elapsed?: ReactNode;
  label: ReactNode;
  subtle?: boolean;
}) {
  return (
    <span
      role="status"
      data-active={active}
      data-agent-thinking
      className={cn(
        "flex min-w-0 items-center gap-2.5 text-xs",
        subtle ? "text-muted-foreground" : "text-foreground/85",
      )}
    >
      {active ? (
        <Spinner aria-hidden="true" size="xs" className="shrink-0" />
      ) : (
        <span
          aria-hidden="true"
          className="size-3 shrink-0 rounded-full border border-current opacity-40"
        />
      )}
      <span className="min-w-0 truncate font-medium">{label}</span>
      {elapsed ? (
        <span className="shrink-0 font-mono text-2xs text-muted-foreground tabular-nums">
          {elapsed}
        </span>
      ) : null}
    </span>
  );
}
