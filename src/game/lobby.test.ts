import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canAddSlotCount } from "./lobby-rules.ts";

describe("public lobby limits", () => {
  it("allows only one opponent regardless of map size", () => {
    assert.equal(canAddSlotCount(1, 8, true), true);
    assert.equal(canAddSlotCount(2, 8, true), false);
  });

  it("keeps larger slot caps for non-public games", () => {
    assert.equal(canAddSlotCount(2, 8), true);
  });
});
