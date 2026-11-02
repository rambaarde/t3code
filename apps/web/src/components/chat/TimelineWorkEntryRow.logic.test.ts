import { assert, describe, it } from "@effect/vitest";

import { todoStepPresentationStatus } from "./TimelineWorkEntryRow.logic";

describe("todoStepPresentationStatus", () => {
  it("stops a stale running step after its run ends", () => {
    assert.equal(todoStepPresentationStatus("running", false), "stopped");
    assert.equal(todoStepPresentationStatus("running", true), "running");
    assert.equal(todoStepPresentationStatus("completed", false), "completed");
    assert.equal(todoStepPresentationStatus("pending", false), "pending");
  });
});
