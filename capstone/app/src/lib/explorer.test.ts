import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { explorerClusterQuery } from "./explorer";

describe("explorerClusterQuery", () => {
  it("defaults to Devnet", () => {
    assert.equal(explorerClusterQuery(undefined), "?cluster=devnet");
    assert.equal(explorerClusterQuery("https://api.devnet.solana.com"), "?cluster=devnet");
  });

  it("passes a local validator as a custom cluster", () => {
    for (const url of ["http://127.0.0.1:8899", "http://localhost:8899"]) {
      assert.equal(explorerClusterQuery(url), `?cluster=custom&customUrl=${encodeURIComponent(url)}`);
    }
  });

  it("recognises Mainnet and Testnet", () => {
    assert.equal(explorerClusterQuery("https://api.mainnet-beta.solana.com"), "");
    assert.equal(explorerClusterQuery("https://api.testnet.solana.com"), "?cluster=testnet");
  });
});
