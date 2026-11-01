import { piRecordField as recordField, piRecordString as recordString } from "./rpc.ts";
export type OmpTodoStep = {
  readonly id: string;
  readonly text: string;
  readonly status: "pending" | "running" | "completed";
};

export function normalizeOmpTodoPhases(input: unknown): ReadonlyArray<OmpTodoStep> {
  const phases = recordField(input, "todoPhases");
  if (!Array.isArray(phases)) return [];
  const steps: OmpTodoStep[] = [];
  for (const [phaseIndex, phase] of phases.entries()) {
    const phaseName = recordString(phase, "name");
    const items = recordField(phase, "tasks") ?? recordField(phase, "items");
    if (!Array.isArray(items)) continue;
    for (const [itemIndex, item] of items.entries()) {
      const content = recordString(item, "content");
      if (content === undefined || content.trim().length === 0) continue;
      const itemStatus = recordString(item, "status");
      const status =
        itemStatus === "completed"
          ? "completed"
          : itemStatus === "in_progress" || itemStatus === "running"
            ? "running"
            : "pending";
      steps.push({
        id: `todo-${phaseIndex + 1}-${itemIndex + 1}`,
        text: phaseName === undefined ? content : `${phaseName}: ${content}`,
        status,
      });
    }
  }
  return steps;
}

export type OmpSubagentStatus = "running" | "completed" | "failed" | "interrupted";

export type OmpSubagentSnapshot = {
  readonly id: string;
  readonly agent: string;
  readonly task: string;
  readonly status: OmpSubagentStatus;
  readonly progress: string | undefined;
  readonly result: string | null;
  readonly model: string | undefined;
};

export function normalizeOmpSubagentPayload(payload: unknown): OmpSubagentSnapshot | null {
  const id = recordString(payload, "id");
  if (id === undefined) return null;
  const agent = recordString(payload, "agent") ?? recordString(payload, "name") ?? "subagent";
  const task =
    recordString(payload, "task") ??
    recordString(payload, "assignment") ??
    recordString(payload, "prompt") ??
    "";
  const lifecycle = recordString(payload, "status");
  const status: OmpSubagentStatus =
    lifecycle === "completed"
      ? "completed"
      : lifecycle === "failed"
        ? "failed"
        : lifecycle === "aborted"
          ? "interrupted"
          : "running";
  const rawProgress = recordField(payload, "progress");
  const progress =
    typeof rawProgress === "string"
      ? rawProgress.slice(0, 500)
      : rawProgress === undefined
        ? undefined
        : (recordString(payload, "message") ?? "Subagent working");
  return {
    id,
    agent,
    task,
    status,
    progress,
    result: recordString(payload, "result") ?? recordString(payload, "output") ?? null,
    model: recordString(payload, "model"),
  };
}
