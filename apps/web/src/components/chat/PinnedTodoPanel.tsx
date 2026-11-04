/**
 * The agent's current todo list, pinned above the composer while it works, like the OMP
 * terminal keeps its task list in view instead of letting it scroll away.
 */
import type { OrchestrationV2PlanStep } from "@t3tools/contracts";
import {
  CheckCircle2Icon,
  ChevronDownIcon,
  CircleDashedIcon,
  LoaderCircleIcon,
} from "lucide-react";
import { useState } from "react";

import { cn } from "../../lib/utils";

export function PinnedTodoPanel({
  steps,
}: {
  readonly steps: ReadonlyArray<OrchestrationV2PlanStep>;
}) {
  const [open, setOpen] = useState(true);
  const completed = steps.filter((step) => step.status === "completed").length;
  const current = steps.find((step) => step.status === "running");
  return (
    <section
      aria-label="Current tasks"
      data-pinned-todo-panel
      className="mx-1 mb-1 rounded-lg border border-border/60 bg-card/80 px-2 py-1 text-xs"
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full min-w-0 items-center gap-2 rounded-md px-1 py-0.5 text-start outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
      >
        <span className="shrink-0 font-medium text-foreground">Tasks</span>
        <span className="shrink-0 text-2xs text-muted-foreground tabular-nums">
          {completed}/{steps.length}
        </span>
        {current && !open ? (
          <span className="min-w-0 flex-1 truncate text-muted-foreground">{current.text}</span>
        ) : (
          <span className="flex-1" />
        )}
        <ChevronDownIcon
          aria-hidden
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <ol className="mt-0.5 max-h-40 space-y-0.5 overflow-y-auto pb-0.5">
          {steps.map((step) => (
            <li key={step.id} className="flex min-w-0 items-center gap-2 px-1 py-0.5">
              {step.status === "completed" ? (
                <CheckCircle2Icon
                  aria-hidden
                  className="size-3.5 shrink-0 text-success-foreground"
                />
              ) : step.status === "running" ? (
                <LoaderCircleIcon
                  aria-hidden
                  className="size-3.5 shrink-0 animate-spin text-primary"
                />
              ) : (
                <CircleDashedIcon
                  aria-hidden
                  className="size-3.5 shrink-0 text-muted-foreground/60"
                />
              )}
              <span
                className={cn(
                  "min-w-0 flex-1 truncate",
                  step.status === "completed"
                    ? "text-muted-foreground line-through"
                    : step.status === "running"
                      ? "font-medium text-foreground"
                      : "text-foreground/80",
                )}
              >
                {step.text}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
