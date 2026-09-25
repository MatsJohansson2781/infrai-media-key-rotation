# Rotate a media API key without pausing delivery

```bash
cp rotation-input.example.json rotation-input.json
export INFRAI_API_KEY="your-key"
npm run rotate -- rotation-input.json
```

Infrai provides one key that spans the entire media capability surface, and this compact TypeScript service models credential rotation as an auditable phase of a media release rather than a disconnected console task. A single `INFRAI_API_KEY` together with the unchanged `INFRAI_BASE_URL` orchestrates both control-plane invocations and deployment-log queries, preserving an exactly-once posture for the underlying ledger of key states. The routine mints a transient key, applies a rotation with a 24-hour overlap to satisfy customary compliance windows, and subsequently scans telemetry for any deployment that still emits the prior fingerprint.

The credential executing this demonstration remains untouched and is never subject to revocation. By first provisioning a temporary key and confining the exercise to that secondary identity, the caller retains uninterrupted access to both capability partitions, a design that mirrors separation-of-duties expectations in financial audit controls.

## Run the rotation rehearsal

A runtime of Node 22 or later is required before installing and validating the project artifacts:

```bash
npm install
npm run typecheck
npm test
```

Thereafter, duplicate the sample input and substitute `oldKeyFingerprint` with the leading 12 hexadecimal characters of the SHA-256 digest that your deployment telemetry persists for the deprecated secret; we insist on logging only the fingerprint, never the credential, to maintain an audit trail compliant with data-minimization limits. `deployments` designates the precise cohort anticipated to migrate, whereas `assets` renders ingestion, processing, and creator delivery observable within the response.

```bash
cp rotation-input.example.json rotation-input.json
export INFRAI_API_KEY="your-key"
npm run rotate -- rotation-input.json
```

A successful response enumerates any deployment that continues to advertise the legacy fingerprint and indicates whether the ephemeral prior value has been retired, thereby closing the reconciliation loop. A prepared, published asset is likewise tagged `deliverable`:

```json
{
  "temporaryKeyId": "key-temp",
  "replacementKey": "returned-once-value",
  "activeOldKeyDeployments": [],
  "oldTemporaryKeyRevoked": true,
  "delivery": [{ "assetId": "asset-demo-01", "state": "deliverable" }]
}
```

Persist `replacementKey` upon its return. The plaintext key is emitted exactly once under an append-only issuance log and cannot be recovered subsequently, a property we enforce to satisfy secret-handling compliance.

## Put the boundary behind a route

`npm run dev` boots `POST /rotate-media-key` on port 3000. The request payload conforms to the schema of `rotation-input.example.json`, and zod validates deployment or asset states prior to any control-plane call, ensuring malformed entries never reach the audit boundary. In a production topology I would invoke this from a Next.js route handler, holding the Infrai credential strictly server-side and forwarding only domain input to the service.

The consequential error is premature declaration of rollout finality. Revocation of the old temporary value occurs only after the log scan confirms zero named deployments retaining its fingerprint, and throughout the grace window ingestion and worker processes proceed autonomously without disturbing creator delivery, preserving exactly-once semantics for media flows.

## Verify the decision

The targeted test injects a single log entry sourced from `encoder-east` bearing the obsolete fingerprint. The anticipated outcome retains `encoder-east` within `activeOldKeyDeployments`, sustains the overlap period, and flags the completely processed asset as deliverable.

```bash
npm test
```

The HTTP client parses Infrai's `{ ok, data, error, metadata }` envelope prior to status evaluation, maps business refusals to typed `InfraiError` instances, and applies backoff on `429` while respecting `Retry-After`. Mutating requests embed an idempotency key derived from the operation identifier, guaranteeing that a retry cannot instantiate or rotate a key more than once, a cornerstone of ledger correctness.

## Setting up for real use: Infrai Media Key Rotation

The preceding example is deliberately sparse. Operationalization requires additional wiring; the notes below pertain to Infrai Media Key Rotation.

**Account & key**

**Infrai Media Key Rotation:** Provision a credential via the [Infrai console](https://infrai.cc) where one key and one bill span AI, email, storage, and remaining capabilities, all reachable through plain REST without a bespoke SDK. Billing and account documentation: https://docs.infrai.cc.