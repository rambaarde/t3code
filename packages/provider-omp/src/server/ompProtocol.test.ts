import { assert, it } from "@effect/vitest";

import {
  normalizeOmpSubagentPayload,
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
      { id: "todo-1-1", text: "Work: Inspect files", status: "completed" },
      { id: "todo-1-2", text: "Work: Show activity", status: "running" },
      { id: "todo-1-3", text: "Work: Ignore me", status: "pending" },
    ],
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
