import type { OrchestrationV2ProjectedTurnItem } from "@t3tools/contracts";
import {
  BotIcon,
  BrainIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  CircleAlertIcon,
  CircleDashedIcon,
  Code2Icon,
  ExternalLinkIcon,
  FileIcon,
  FileSearchIcon,
  GithubIcon,
  GlobeIcon,
  HourglassIcon,
  ImageIcon,
  LoaderCircleIcon,
  MonitorIcon,
  ShieldCheckIcon,
  TerminalIcon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react";
import { use, useState, type ReactNode } from "react";

import { Button } from "../ui/button";
import ChatMarkdown from "../ChatMarkdown";
import { resolveExternalWebLinkHref } from "./externalLinkContextMenu";
import { V2ItemInspector } from "./V2ItemInspector";
import { TimelineRowCtx, type TimelineWorkEntry } from "./timelineRowContext";

type NativeActivityItem = Extract<
  OrchestrationV2ProjectedTurnItem["item"],
  {
    readonly type: "command_execution" | "dynamic_tool" | "file_search" | "subagent" | "web_search";
  }
>;

export function isNativeActivityCardItem(
  item: OrchestrationV2ProjectedTurnItem["item"] | undefined,
): item is NativeActivityItem {
  return (
    item?.type === "command_execution" ||
    item?.type === "dynamic_tool" ||
    item?.type === "file_search" ||
    item?.type === "subagent" ||
    item?.type === "web_search"
  );
}

export function NativeActivityCard({
  item,
  workEntry,
  workspaceRoot,
}: {
  item: NativeActivityItem;
  workEntry: TimelineWorkEntry;
  workspaceRoot: string | undefined;
}) {
  const ctx = use(TimelineRowCtx);
  const projectedItem = workEntry.projectedItem;
  if (item.type === "dynamic_tool" && isDuplicateHarnessTool(item.toolName)) return null;

  const details = projectedItem ? (
    <details className="mt-2 border-t border-border/50 pt-1.5">
      <summary className="cursor-pointer list-none text-2xs text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
        Technical details
      </summary>
      <div className="mt-1.5 rounded-md bg-muted/30 p-2">
        <V2ItemInspector
          projectedItem={projectedItem}
          environmentId={ctx.activeThreadEnvironmentId}
          cwd={ctx.markdownCwd}
          workspaceRoot={workspaceRoot}
          onOpenToolDiff={ctx.onOpenToolDiff}
          onImageExpand={ctx.onImageExpand}
          source={ctx.turnItemSource}
        />
      </div>
    </details>
  ) : null;

  switch (item.type) {
    case "command_execution":
      return (
        <ActivityCardShell
          kind="command"
          summary={compactActivitySummary(item.input)}
          title={item.title ?? "Command"}
          status={item.status}
        >
          <code className="block max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/35 px-2.5 py-2 font-mono text-xs leading-relaxed text-foreground/85">
            {item.input}
          </code>
          {item.output ? (
            <pre className="mt-1.5 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/25 px-2.5 py-2 font-mono text-xs leading-relaxed text-muted-foreground">
              {item.output}
            </pre>
          ) : null}
          {details}
        </ActivityCardShell>
      );
    case "file_search":
      return (
        <ActivityCardShell
          kind="file-search"
          meta={item.results?.length ? `${item.results.length} matches` : undefined}
          summary={compactActivitySummary(item.pattern)}
          title={item.title ?? "File search"}
          status={item.status}
        >
          <ActivityQuery label="Pattern" value={item.pattern ?? "Project files"} />
          {item.results?.length ? (
            <ul className="mt-1 space-y-1">
              {item.results.slice(0, 8).map((result) => (
                <li
                  key={`${result.fileName}:${result.line ?? ""}:${result.column ?? ""}`}
                  className="relative ps-3 text-xs before:absolute before:start-0 before:top-2 before:size-1 before:rounded-full before:bg-border"
                >
                  <p className="truncate text-foreground/85">{result.fileName}</p>
                  {result.line ? (
                    <p className="text-2xs text-muted-foreground">
                      Line {result.line}
                      {result.column ? `:${result.column}` : ""}
                    </p>
                  ) : null}
                  {result.preview ? (
                    <p className="line-clamp-2 whitespace-pre-wrap text-muted-foreground">
                      {result.preview}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <ActivityEmptyState status={item.status} activeLabel="Searching project files…" />
          )}
          {details}
        </ActivityCardShell>
      );
    case "web_search":
      return (
        <ActivityCardShell
          kind="web-search"
          meta={item.results?.length ? `${item.results.length} sources` : undefined}
          summary={compactActivitySummary(item.patterns?.join(", "))}
          title={item.title ?? "Web search"}
          status={item.status}
        >
          <ActivityQuery label="Query" value={item.patterns?.join(", ") || "Searching the web"} />
          {item.results?.length ? (
            <ul className="mt-1 space-y-1.5">
              {item.results.slice(0, 8).map((result, index) => {
                const href = result.url ? resolveExternalWebLinkHref(result.url) : null;
                const title = result.title?.trim() || result.url || `Source ${index + 1}`;
                return (
                  <li
                    key={result.url ?? `${title}:${result.snippet ?? ""}`}
                    className="relative ps-3 before:absolute before:start-0 before:top-2 before:size-1 before:rounded-full before:bg-border"
                  >
                    {href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="group block min-w-0 rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        <span className="flex items-center gap-1 text-xs font-medium text-foreground/90 group-hover:underline">
                          <span className="truncate">{title}</span>
                          <ExternalLinkIcon aria-hidden="true" className="size-3 shrink-0" />
                        </span>
                        {result.snippet ? (
                          <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-muted-foreground">
                            {result.snippet}
                          </span>
                        ) : null}
                        <span className="mt-0.5 block truncate text-2xs text-muted-foreground/70">
                          {result.url}
                        </span>
                      </a>
                    ) : (
                      <p className="text-xs text-foreground/90">{title}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <ActivityEmptyState status={item.status} activeLabel="Searching sources…" />
          )}
          {details}
        </ActivityCardShell>
      );
    case "subagent":
      return (
        <ActivityCardShell
          kind="subagent"
          summary={compactActivitySummary(item.prompt)}
          title={item.title ?? "Task"}
          status={item.status}
        >
          <ActivitySectionLabel>Goal</ActivitySectionLabel>
          <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground/85">
            {item.prompt || "Subagent task"}
          </p>
          {item.progress ? (
            <div className="mt-2">
              <ActivitySectionLabel>Progress</ActivitySectionLabel>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-foreground/80">
                {item.progress}
              </p>
            </div>
          ) : null}
          {item.result ? (
            <div className="mt-2 rounded-md bg-muted/25 px-2.5 py-2">
              <ActivitySectionLabel>Result</ActivitySectionLabel>
              <div className="mt-0.5 text-xs text-foreground/85">
                <ChatMarkdown
                  inline
                  text={item.result}
                  cwd={ctx.markdownCwd}
                  environmentId={ctx.activeThreadEnvironmentId}
                  threadRef={ctx.threadRef ?? undefined}
                  isStreaming={item.status === "running"}
                />
              </div>
            </div>
          ) : null}
          {item.childThreadId ? (
            <Button
              size="xs"
              variant="outline"
              className="mt-3"
              onClick={() => ctx.onOpenThread(item.childThreadId!)}
            >
              Open subagent
            </Button>
          ) : null}
          {details}
        </ActivityCardShell>
      );
    case "dynamic_tool": {
      const toolName = item.toolName ?? item.title ?? "tool";
      const output = toolOutputText(item.output);
      const inputRows = toolInputRows(item.input);
      return (
        <ActivityCardShell
          kind={activityKindForTool(toolName)}
          summary={toolPrimaryArgument(item.input)}
          title={toolActivityTitle(toolName)}
          toolName={toolName}
          status={item.status}
        >
          {inputRows.length > 0 ? (
            <div className="space-y-1">
              {inputRows.map(([label, value]) => (
                <ActivityQuery key={label} label={humanizeToolName(label)} value={value} />
              ))}
            </div>
          ) : (
            <ActivityEmptyState status={item.status} activeLabel="Running tool…" />
          )}
          {output ? (
            <div className="mt-2 max-h-64 overflow-auto rounded-md bg-muted/25 px-2.5 py-2 text-xs leading-relaxed text-foreground/85">
              <ChatMarkdown
                text={output}
                cwd={ctx.markdownCwd}
                environmentId={ctx.activeThreadEnvironmentId}
                threadRef={ctx.threadRef ?? undefined}
                isStreaming={item.status === "running"}
              />
            </div>
          ) : null}
          {details}
        </ActivityCardShell>
      );
    }
  }
}

type ActivityKind =
  | "browser"
  | "code"
  | "command"
  | "file-read"
  | "file-search"
  | "github"
  | "media"
  | "memory"
  | "security"
  | "subagent"
  | "tool"
  | "wait"
  | "web-search";

const DUPLICATE_HARNESS_TOOLS: Record<string, true> = {
  ask: true,
  subagent: true,
  task: true,
  todo: true,
};

function isDuplicateHarnessTool(toolName: string | null): boolean {
  return toolName !== null && DUPLICATE_HARNESS_TOOLS[toolName.toLowerCase()] === true;
}

function activityKindForTool(toolName: string): ActivityKind {
  switch (toolName.toLowerCase()) {
    case "bash":
    case "powershell":
      return "command";
    case "ast_edit":
    case "ast_grep":
    case "debug":
    case "eval":
    case "lsp":
      return "code";
    case "read":
      return "file-read";
    case "glob":
    case "grep":
      return "file-search";
    case "browser":
    case "computer":
      return "browser";
    case "web_search":
      return "web-search";
    case "github":
      return "github";
    case "archive":
    case "recall":
    case "retain":
      return "memory";
    case "generate_image":
    case "inspect_image":
    case "show_image":
    case "show_video":
    case "tts":
      return "media";
    case "security_scan":
      return "security";
    case "subagent":
    case "task":
      return "subagent";
    case "wait":
      return "wait";
    default:
      return "tool";
  }
}

const TOOL_ACTIVITY_TITLES: Record<string, string> = {
  archive: "Search history",
  ask: "Question",
  ast_edit: "Structural edit",
  ast_grep: "Structural search",
  bash: "Run command",
  browser: "Browser",
  computer: "Computer control",
  debug: "Debugger",
  edit: "Edit file",
  eval: "Evaluate code",
  generate_image: "Generate image",
  github: "GitHub",
  glob: "Find files",
  grep: "Search files",
  inspect_image: "Inspect image",
  lsp: "Language intelligence",
  read: "Read",
  recall: "Recall memory",
  retain: "Save memory",
  security_scan: "Security scan",
  show_image: "Show image",
  show_video: "Show video",
  task: "Subagent task",
  todo: "Task plan",
  tts: "Generate speech",
  wait: "Wait for tasks",
  web_search: "Web search",
  write: "Write file",
};

function toolActivityTitle(toolName: string): string {
  return TOOL_ACTIVITY_TITLES[toolName.toLowerCase()] ?? humanizeToolName(toolName);
}

function humanizeToolName(value: string): string {
  const words = value.replaceAll("__", " · ").replaceAll("_", " ").trim();
  return words.length > 0 ? words.charAt(0).toUpperCase() + words.slice(1) : "Tool";
}

const PRIMARY_ARGUMENT_KEYS = [
  "query",
  "pattern",
  "path",
  "url",
  "command",
  "task",
  "name",
] as const;

function compactActivitySummary(value: string | null | undefined): string | undefined {
  const compact = value?.replace(/\s+/gu, " ").trim();
  if (!compact) return undefined;
  return compact.length > 96 ? `${compact.slice(0, 93)}…` : compact;
}

function toolPrimaryArgument(input: unknown): string | undefined {
  if (typeof input === "string") return compactActivitySummary(input);
  if (typeof input !== "object" || input === null || Array.isArray(input)) return undefined;
  const entries = Object.entries(input);
  for (const key of PRIMARY_ARGUMENT_KEYS) {
    const value = entries.find(([entryKey]) => entryKey === key)?.[1];
    const summary = compactActivitySummary(toolValueText(value));
    if (summary) return summary;
  }
  return compactActivitySummary(toolInputRows(input)[0]?.[1]);
}

function toolInputRows(input: unknown): readonly (readonly [string, string])[] {
  if (typeof input === "string") return input.length > 0 ? [["Input", input]] : [];
  if (typeof input !== "object" || input === null || Array.isArray(input)) return [];
  return Object.entries(input)
    .map(([key, value]) => [key, toolValueText(value)] as const)
    .filter((entry): entry is readonly [string, string] => entry[1] !== null)
    .slice(0, 6);
}

function toolOutputText(output: unknown): string | null {
  if (typeof output === "string") return output.trim() || null;
  if (typeof output !== "object" || output === null || Array.isArray(output)) {
    return toolValueText(output);
  }
  if ("structuredContent" in output) {
    const structured = toolValueText(output.structuredContent);
    if (structured) return structured;
  }
  if ("content" in output && Array.isArray(output.content)) {
    const text = output.content
      .map((block) => {
        if (
          typeof block !== "object" ||
          block === null ||
          Array.isArray(block) ||
          !("text" in block)
        ) {
          return null;
        }
        return typeof block.text === "string" ? block.text : null;
      })
      .filter((value): value is string => value !== null)
      .join("\n\n")
      .trim();
    if (text.length > 0) return text;
  }
  return toolValueText(output);
}

function toolValueText(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

const ICON_BY_ACTIVITY_KIND: Record<ActivityKind, LucideIcon> = {
  browser: MonitorIcon,
  code: Code2Icon,
  command: TerminalIcon,
  "file-read": FileIcon,
  "file-search": FileSearchIcon,
  github: GithubIcon,
  media: ImageIcon,
  memory: BrainIcon,
  security: ShieldCheckIcon,
  subagent: BotIcon,
  tool: WrenchIcon,
  wait: HourglassIcon,
  "web-search": GlobeIcon,
};

function ActivityCardShell({
  children,
  kind,
  meta,
  status,
  summary,
  title,
  toolName,
}: {
  children: ReactNode;
  kind: ActivityKind;
  meta?: string | undefined;
  status: NativeActivityItem["status"];
  summary: string | undefined;
  title: string;
  toolName?: string;
}) {
  const Icon = ICON_BY_ACTIVITY_KIND[kind];
  const isActive = status === "running" || status === "pending" || status === "waiting";
  const isFailed = status === "failed" || status === "cancelled" || status === "interrupted";
  const [open, setOpen] = useState(isActive);
  return (
    <details
      aria-label={`${title} activity`}
      data-native-activity-card
      data-native-activity-kind={kind}
      data-native-tool={toolName}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="group/activity my-0.5"
    >
      <summary className="flex min-h-7 cursor-pointer list-none items-center gap-2 rounded-md px-1.5 py-1 text-xs outline-none transition-colors hover:bg-muted/45 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset [&::-webkit-details-marker]:hidden">
        <Icon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="shrink-0 font-medium text-foreground">{title}</span>
        {summary ? (
          <code className="min-w-0 flex-1 truncate font-mono text-2xs text-muted-foreground">
            {summary}
          </code>
        ) : (
          <span className="flex-1" />
        )}
        {meta ? <span className="shrink-0 text-2xs text-muted-foreground">{meta}</span> : null}
        <span className="sr-only">{activityStatusLabel(status)}</span>
        {isActive ? (
          <LoaderCircleIcon
            aria-hidden="true"
            className="size-3.5 shrink-0 animate-spin text-primary"
          />
        ) : status === "completed" ? (
          <CheckCircle2Icon
            aria-hidden="true"
            className="size-3.5 shrink-0 text-success-foreground"
          />
        ) : isFailed ? (
          <CircleAlertIcon aria-hidden="true" className="size-3.5 shrink-0 text-destructive" />
        ) : (
          <CircleDashedIcon
            aria-hidden="true"
            className="size-3.5 shrink-0 text-muted-foreground"
          />
        )}
        <ChevronDownIcon
          aria-hidden="true"
          className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open/activity:rotate-180"
        />
      </summary>
      <div className="relative ms-3 mt-0.5 border-s border-border/70 pb-1 ps-5 before:absolute before:start-0 before:top-0 before:h-3 before:w-3 before:rounded-bl-md before:border-b before:border-border/70">
        {children}
      </div>
    </details>
  );
}

function ActivityQuery({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[minmax(4.5rem,auto)_minmax(0,1fr)] gap-x-3 py-0.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <code className="min-w-0 break-words font-mono text-foreground/80">{value}</code>
    </div>
  );
}

function ActivitySectionLabel({ children }: { children: ReactNode }) {
  return <p className="text-2xs font-medium text-muted-foreground">{children}</p>;
}

function ActivityEmptyState({
  activeLabel,
  status,
}: {
  activeLabel: string;
  status: NativeActivityItem["status"];
}) {
  return (
    <div className="mt-1 flex items-center gap-2 py-1 text-xs text-muted-foreground">
      {status === "running" || status === "pending" || status === "waiting" ? (
        <LoaderCircleIcon aria-hidden="true" className="size-3.5 animate-spin text-primary" />
      ) : status === "failed" ? (
        <CircleAlertIcon aria-hidden="true" className="size-3.5 text-destructive" />
      ) : status === "completed" ? (
        <CheckCircle2Icon aria-hidden="true" className="size-3.5 text-success-foreground" />
      ) : (
        <CircleDashedIcon aria-hidden="true" className="size-3.5" />
      )}
      {status === "running" || status === "pending" || status === "waiting"
        ? activeLabel
        : status === "completed"
          ? "No results returned."
          : "No activity details available."}
    </div>
  );
}

function activityStatusLabel(status: NativeActivityItem["status"]): string {
  switch (status) {
    case "running":
    case "pending":
    case "waiting":
      return "In progress";
    case "completed":
      return "Complete";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    case "interrupted":
      return "Stopped";
    case "idle":
      return "Queued";
  }
}
