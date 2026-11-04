import { assert, it } from "@effect/vitest";

import {
  normalizeOmpSubagentPayload,
  ompEditDiffToUnifiedHunks,
  ompEditTargetPath,
  normalizeOmpTodoPhases,
  normalizeOmpWebSearch,
} from "./ompProtocol.ts";

it("normalizes OMP todo phases into stable T3 step statuses", () => {
  assert.deepStrictEqual(
    normalizeOmpTodoPhases({
      todoPhases: [
        {
          name: "Work",
          tasks: [
            { content: "Inspect files", status: "completed" },
            { content: "Show activity", status: "in_progress" },
            { content: "Ignore me", status: "abandoned" },
          ],
        },
      ],
    }),
    [
      { id: "todo-1-1", text: "Inspect files", status: "completed" },
      { id: "todo-1-2", text: "Show activity", status: "running" },
      { id: "todo-1-3", text: "Ignore me", status: "pending" },
    ],
  );
  // Several phases keep the phase name so steps stay distinguishable.
  assert.deepStrictEqual(
    normalizeOmpTodoPhases({
      todoPhases: [
        { name: "Build", tasks: [{ content: "Write code", status: "completed" }] },
        { name: "Ship", tasks: [{ content: "Install", status: "pending" }] },
      ],
    }).map((step) => step.text),
    ["Build: Write code", "Ship: Install"],
  );
});

it("normalizes OMP subagent lifecycle payloads for live activity rows", () => {
  assert.deepStrictEqual(
    normalizeOmpSubagentPayload({
      id: "agent-1",
      agent: "researcher",
      task: "Inspect repository",
      status: "completed",
      progress: "Finished scan",
      result: "12 files",
      model: "gpt-5.6-luna",
    }),
    {
      id: "agent-1",
      agent: "researcher",
      task: "Inspect repository",
      status: "completed",
      progress: "Finished scan",
      result: "12 files",
      model: "gpt-5.6-luna",
    },
  );
  assert.strictEqual(normalizeOmpSubagentPayload({ status: "started" }), null);
});

it("reads a progress frame's nested id and last intent, and skips raw child events", () => {
  // Shape of a real OMP v18 `subagent_progress` payload (trimmed).
  const progressFrame = {
    index: 0,
    agent: "scout",
    task: "Read README.md",
    progress: {
      id: "ReadmeFirstLine",
      status: "running",
      lastIntent: "Reading README first line",
      recentTools: [{ tool: "read", intent: "Reading README first line" }],
      toolCount: 1,
      tokens: 9072,
      resolvedModel: "anthropic/claude-opus-5-5:high",
    },
  };
  assert.deepStrictEqual(normalizeOmpSubagentPayload(progressFrame), {
    id: "ReadmeFirstLine",
    agent: "scout",
    task: "Read README.md",
    status: "running",
    progress: "Reading README first line · 1 tool · 9.1k tokens",
    result: null,
    model: "anthropic/claude-opus-5-5:high",
  });
  assert.strictEqual(
    normalizeOmpSubagentPayload({ id: "ReadmeFirstLine", event: { type: "agent_start" } }),
    null,
  );
});

it("maps an OMP web search to its query and readable sources", () => {
  assert.deepStrictEqual(
    normalizeOmpWebSearch(
      { i: "Checking docs", query: " supabase rls " },
      {
        details: {
          response: {
            sources: [
              { title: "RLS", url: "https://supabase.com/docs/rls", snippet: " Policies " },
              { title: "Untitled source" },
              { author: "no title or url" },
            ],
          },
        },
      },
    ),
    {
      patterns: ["supabase rls"],
      results: [
        { title: "RLS", url: "https://supabase.com/docs/rls", snippet: "Policies" },
        { title: "Untitled source" },
      ],
    },
  );
  assert.deepStrictEqual(normalizeOmpWebSearch({ query: "running" }, undefined), {
    patterns: ["running"],
  });
});

it("keeps a search answer but drops the numbered source list it repeats", () => {
  assert.deepStrictEqual(
    normalizeOmpWebSearch(
      { query: "rls" },
      { details: { response: { sources: [{ title: "RLS", url: "https://supabase.com/rls" }] } } },
      "Enable RLS on every exposed table.\n\n[1] RLS\n    https://supabase.com/rls",
    ).summary,
    "Enable RLS on every exposed table.",
  );
  assert.strictEqual(
    normalizeOmpWebSearch({ query: "x" }, {}, "[1] Only a list\n    https://a.example").summary,
    undefined,
  );
});

it("turns an OMP edit result diff into unified hunks with correct line ranges", () => {
  assert.strictEqual(
    ompEditTargetPath({ input: "[src/math.ts#13E1]\nPUT >1:\n+export const sub = 1;" }),
    "src/math.ts",
  );
  // Real shape from an OMP edit result: one replaced line plus one added line, then a later hunk.
  const converted = ompEditDiffToUnifiedHunks(
    [
      " 1|---",
      " 2|type: ai-project-context",
      "-3|old name",
      "+3|new name",
      "+4|display",
      " 4|repo",
      "",
      " 9|tail",
      "-10|gone",
    ].join("\n"),
  );
  assert.deepStrictEqual(converted, {
    hunks: [
      "@@ -1,4 +1,5 @@",
      " ---",
      " type: ai-project-context",
      "-old name",
      "+new name",
      "+display",
      " repo",
      "@@ -9,2 +10,1 @@",
      " tail",
      "-gone",
      "",
    ].join("\n"),
    additions: 2,
    deletions: 2,
  });
  assert.strictEqual(ompEditDiffToUnifiedHunks("not a diff"), undefined);
});
