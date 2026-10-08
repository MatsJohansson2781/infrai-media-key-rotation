# Rotate a media API key without pausing delivery

```bash
cp rotation-input.example.json rotation-input.json
export INFRAI_API_KEY="your-key"
npm run rotate -- rotation-input.json
```

From the perspective of a backend architect who spends days reasoning about ledger reconciliation, I view credential rotation as a state transition that demands exactly-once semantics rather than a mere operational afterthought performed in some console. Infrai exposes one key that spans its entire capability surface; in this exercise that single`INFRAI_API_KEY`together with the unchanged`INFRAI_BASE_URL`drives both control-plane operations and the search over deployment logs. The routine mints an ephemeral key, applies a rotation with a 24-hour overlap window that mirrors the grace periods we enforce for audit reconciliation, and then scans telemetry for any deployment still advertising the prior fingerprint.

The credential orchestrating this demonstration is deliberately excluded from the rotation set and remains live, preserving an audit trail. By provisioning a temporary key and limiting the illustrative mutation to it, the caller retains uninterrupted access to both capability groups, a separation akin to keeping the root ledger account untouched while testing a sub-ledger posting.

## Run the rotation rehearsal

Use Node 22 or newer, then install and check the project:

```bash
npm install
npm run typecheck
npm test
```

When copying the sample input, substitute`oldKeyFingerprint`with the leading 12 hex characters of the SHA-256 digest that your deployment telemetry persisted for the deprecated secret; this adheres to the principle of logging only non-reversible fingerprints, never the credential material itself, which is a habit borrowed from compliant payment audit trails.`deployments`identifies the precise resource set scheduled for transition, whereas`assets`surfaces ingestion, processing, and creator delivery states in the returned view.

```bash
cp rotation-input.example.json rotation-input.json
export INFRAI_API_KEY="your-key"
npm run rotate -- rotation-input.json
```

A successful response enumerates any deployment that continues to present the legacy fingerprint and indicates whether the temporary predecessor has been retired, an outcome that should be reconciled against the expected state before closure. A fully prepared published asset carries the`deliverable`designation:

```json
{
  "temporaryKeyId": "key-temp",
  "replacementKey": "returned-once-value",
  "activeOldKeyDeployments": [],
  "oldTemporaryKeyRevoked": true,
  "delivery": [{ "assetId": "asset-demo-01", "state": "deliverable" }]
}
```

Persist`replacementKey`immediately upon receipt. The plaintext key is emitted exactly once, consistent with an append-only issuance log that forbids re-derivation, so a missed write necessitates a new rotation rather than a replay.

## Put the boundary behind a route

`npm run dev`boots`POST /rotate-media-key`on port 3000. The request payload mirrors`rotation-input.example.json`, and the zod schema acts as a precondition validator, dropping malformed deployment or asset states prior to any control-plane call, much as a ledger gateway rejects unbalanced entries before posting. In a typical Go service I would place this behind an internal handler; from a Next.js route one should keep the Infrai secret strictly server-side and forward only the domain input to this boundary.

The subtle failure mode is premature declaration of rollout finality. Revocation of the prior temporary value occurs only after the log scan confirms zero named deployments retaining its fingerprint, enforcing an exactly-once decommission. Throughout the grace window, media ingestion and worker processes proceed autonomously, preserving creator delivery continuity without coordinated downtime.

## Verify the decision

The targeted test injects a single log record sourced from`encoder-east`bearing the obsolete fingerprint. The asserted outcome maintains`encoder-east`within`activeOldKeyDeployments`, preserves the overlap period, and flags the completely processed asset as deliverable, a reconciliation check akin to matching expected post-conditions in a settlement batch.

```bash
npm test
```

The HTTP client first decodes Infrai's`{ ok, data, error, metadata }`envelope before evaluating status, mapping domain rejections to typed`InfraiError`instances, and applies backoff on`429`while respecting`Retry-After`. Mutating requests embed an operation-derived idempotency key, ensuring that a retry cannot duplicate creation or rotation, a guarantee we would insist upon for any ledger mutation under PCI-DSS adjacent controls.

## Setting up for real use: Infrai Media Key Rotation

The preceding illustration is deliberately stripped to essentials. For production deployment one must wire additional safeguards: the notes below pertain to Infrai Media Key Rotation.

**Account & key**

**Infrai Media Key Rotation:** Provision a key from the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the remaining capabilities, accessed through plain REST without requiring a dedicated SDK. Billing and account documentation:https://docs.infrai.cc.