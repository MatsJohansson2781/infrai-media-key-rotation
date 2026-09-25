import assert from "node:assert/strict";
import test from "node:test";
import { rotateMediaKey, type RotationApi } from "../src/rotation_workflow.js";

test("revokes the probe after checking deployments using the old fingerprint", async () => {
  let revokeCalls = 0;
  const api: RotationApi = {
    createTemporaryKey: async () => ({ id: "key-temp", key: "initial-value" }),
    rotateTemporaryKey: async () => ({ id: "key-temp", key: "replacement-value" }),
    searchLogs: async () => [
      { deployment: "encoder-east", keyFingerprint: "abc123-old", event: "asset accepted" }
    ],
    revokeTemporaryKey: async () => { revokeCalls += 1; }
  };

  const result = await rotateMediaKey(api, {
    graceHours: 24,
    deployments: ["encoder-east", "creator-api"],
    oldKeyFingerprint: "abc123",
    assets: [{
      assetId: "asset-42",
      ingestionState: "accepted",
      processingJob: "ready",
      creatorDelivery: "published"
    }]
  }, "test-operation");

  assert.deepEqual(result.activeOldKeyDeployments, ["encoder-east"]);
  assert.equal(result.oldTemporaryKeyRevoked, true);
  assert.equal(revokeCalls, 1);
  assert.deepEqual(result.delivery, [{ assetId: "asset-42", state: "deliverable" }]);
});

test("revokes the probe when rotation fails", async () => {
  let revokeCalls = 0;
  const api: RotationApi = {
    createTemporaryKey: async () => ({ id: "key-temp", key: "initial-value" }),
    rotateTemporaryKey: async () => { throw new Error("rotation failed"); },
    searchLogs: async () => [],
    revokeTemporaryKey: async () => { revokeCalls += 1; }
  };

  await assert.rejects(() => rotateMediaKey(api, {
    graceHours: 24,
    deployments: ["encoder-east"],
    oldKeyFingerprint: "abc123",
    assets: [{
      assetId: "asset-42",
      ingestionState: "accepted",
      processingJob: "ready",
      creatorDelivery: "published"
    }]
  }, "test-operation"), /rotation failed/);

  assert.equal(revokeCalls, 1);
});
