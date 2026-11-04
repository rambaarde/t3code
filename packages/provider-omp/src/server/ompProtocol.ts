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

export type OmpWebSearch = {
  readonly patterns?: ReadonlyArray<string>;
  readonly results?: ReadonlyArray<{
    readonly title?: string;
    readonly url?: string;
    readonly snippet?: string;
  }>;
  readonly summary?: string;
};

const WEB_SEARCH_SUMMARY_MAX_LENGTH = 2_000;

/**
 * OMP's web_search tool: `args.query`, `result.details.response.sources`, and an answer either
 * in `details.response.answer` or as the tool text above its numbered source list.
 */
export function normalizeOmpWebSearch(
  args: unknown,
  result: unknown,
  outputText = "",
): OmpWebSearch {
  const query = recordString(args, "query")?.trim();
  const response = recordField(recordField(result, "details"), "response");
  const sources = recordField(response, "sources");
  const results = Array.isArray(sources)
    ? sources.flatMap((source) => {
        const url = recordString(source, "url")?.trim();
        const title = recordString(source, "title")?.trim();
        const snippet = (recordString(source, "snippet") ?? recordString(source, "text"))?.trim();
        if (!url && !title) return [];
        return [
          { ...(title ? { title } : {}), ...(url ? { url } : {}), ...(snippet ? { snippet } : {}) },
        ];
      })
    : [];
  // The numbered "[1] title / url" lines repeat the sources; what remains is the answer.
  const answer = (
    recordString(response, "answer") ??
    outputText
      .split("\n")
      .filter((line) => !/^\s*\[\d+\]/u.test(line) && !/^\s*https?:\/\//u.test(line))
      .join("\n")
  ).trim();
  const summary =
    answer.length > WEB_SEARCH_SUMMARY_MAX_LENGTH
      ? `${answer.slice(0, WEB_SEARCH_SUMMARY_MAX_LENGTH).trimEnd()}…`
      : answer;
  return {
    ...(query ? { patterns: [query] } : {}),
    ...(results.length > 0 ? { results } : {}),
    ...(summary ? { summary } : {}),
  };
}

export type OmpSubagentStatus = "running" | "completed" | "failed" | "interrupted";

export type OmpSubagentSnapshot = {
  readonly id: string;
  readonly agent: string | undefined;
  readonly task: string | undefined;
  readonly status: OmpSubagentStatus;
  readonly progress: string | undefined;
  readonly result: string | null;
  readonly model: string | undefined;
};

/**
 * One OMP subagent frame as a partial snapshot: lifecycle frames carry `id` and `status`,
 * progress frames nest them in `progress`. Fields a frame lacks stay undefined so the caller
 * can keep the previous value. `subagent_event` frames (a child's raw event) return null:
 * the progress frames already summarize them.
 */
export function normalizeOmpSubagentPayload(payload: unknown): OmpSubagentSnapshot | null {
  if (recordField(payload, "event") !== undefined) return null;
  const rawProgress = recordField(payload, "progress");
  const id = recordString(payload, "id") ?? recordString(rawProgress, "id");
  if (id === undefined) return null;
  const agent = recordString(payload, "agent") ?? recordString(payload, "name");
  const task =
    recordString(payload, "task") ??
    recordString(payload, "assignment") ??
    recordString(payload, "prompt");
  const lifecycle = recordString(payload, "status") ?? recordString(rawProgress, "status");
  const status: OmpSubagentStatus =
    lifecycle === "completed"
      ? "completed"
      : lifecycle === "failed"
        ? "failed"
        : lifecycle === "aborted"
          ? "interrupted"
          : "running";
  return {
    id,
    agent,
    task,
    status,
    progress:
      typeof rawProgress === "string"
        ? rawProgress.slice(0, 500)
        : rawProgress === undefined
          ? undefined
          : (subagentProgressLine(rawProgress) ??
            recordString(payload, "message") ??
            "Subagent working"),
    result: recordString(payload, "result") ?? recordString(payload, "output") ?? null,
    model:
      recordString(payload, "model") ?? recordString(rawProgress, "resolvedModel") ?? undefined,
  };
}

function shortCount(value: number): string {
  return value < 1000 ? String(value) : `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}k`;
}

/**
 * The OMP terminal's subagent line: the latest intent, then tool count and tokens, from a
 * `subagent_progress` object (`lastIntent`, `recentTools`, `toolCount`, `tokens`).
 */
function subagentProgressLine(progress: unknown): string | undefined {
  const recentTools = recordField(progress, "recentTools");
  const lastTool = Array.isArray(recentTools) ? recentTools.at(-1) : undefined;
  const intent =
    recordString(progress, "lastIntent") ??
    recordString(lastTool, "intent") ??
    recordString(lastTool, "tool");
  const toolCount = recordField(progress, "toolCount");
  const tokens = recordField(progress, "tokens");
  const parts = [
    intent?.trim(),
    typeof toolCount === "number" && toolCount > 0
      ? `${toolCount} ${toolCount === 1 ? "tool" : "tools"}`
      : undefined,
    typeof tokens === "number" && tokens > 0 ? `${shortCount(tokens)} tokens` : undefined,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" · ").slice(0, 500) : undefined;
}
