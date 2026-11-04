import { describe, expect, it } from "vite-plus/test";

import { STORAGE_THRESHOLDS, storageLevel } from "./UsageThreadStorage";

describe("storageLevel", () => {
  it("turns yellow and red exactly at each threshold", () => {
    const { warning, critical } = STORAGE_THRESHOLDS.thread;
    expect(
      [warning - 1, warning, critical - 1, critical].map((bytes) =>
        storageLevel(bytes, STORAGE_THRESHOLDS.thread),
      ),
    ).toEqual(["ok", "warning", "warning", "critical"]);
  });
});
