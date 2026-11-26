import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { BN } from "@anchor-lang/core";
import { ACC_SCALE, bpsOf, pendingRent } from "./program";

describe("program.ts rent math", () => {
  test("a share bought after rent was accrued does not receive that earlier rent", () => {
    const acc = ACC_SCALE.mul(new BN(5));
    const oldShares = new BN(10);
    assert.equal(pendingRent(oldShares, acc, new BN(0), new BN(0)).toString(), "50");

    const newShares = new BN(4);
    const debt = newShares.mul(acc).div(ACC_SCALE);
    assert.equal(pendingRent(newShares, acc, debt, new BN(0)).toString(), "0");
  });

  test("bpsOf takes 150 basis points of 10000000 as 150000", () => {
    assert.equal(bpsOf(new BN(10_000_000), 150).toString(), "150000");
  });
});
