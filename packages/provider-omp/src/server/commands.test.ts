import { assert, describe, it } from "@effect/vitest";

import { parseOmpSkillListJson } from "./commands.ts";

describe("parseOmpSkillListJson", () => {
  it("exposes visible OMP skills with their paths and scopes", () => {
    const skills = parseOmpSkillListJson(
      JSON.stringify({
        skills: [
          {
            name: "update-session-log",
            description: "Update the current AI memory session log.",
            filePath: "/Users/test/.omp/agent/skills/update-session-log/SKILL.md",
            source: "native:user",
            hide: false,
          },
          {
            name: "project-audit",
            filePath: "/workspace/.agents/skills/project-audit/SKILL.md",
            source: "agents:project",
          },
          {
            name: "hidden-skill",
            filePath: "/Users/test/.agents/skills/hidden-skill/SKILL.md",
            source: "agents:user",
            hide: true,
          },
        ],
      }),
    );

    assert.deepEqual(skills, [
      {
        name: "update-session-log",
        path: "/Users/test/.omp/agent/skills/update-session-log/SKILL.md",
        enabled: true,
        description: "Update the current AI memory session log.",
        scope: "user",
      },
      {
        name: "project-audit",
        path: "/workspace/.agents/skills/project-audit/SKILL.md",
        enabled: true,
        scope: "project",
      },
    ]);
  });

  it("returns an empty catalog for malformed output", () => {
    assert.deepEqual(parseOmpSkillListJson("not json"), []);
    assert.deepEqual(parseOmpSkillListJson("{}"), []);
  });
});
