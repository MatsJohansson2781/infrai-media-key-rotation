import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { InfraiClient } from "./infrai_client.js";

export const rotationRequestSchema = z.object({
  projectId: z.string().min(1).optional(),
  graceHours: z.number().int().min(1).max(168),
  deployments: z.array(z.string().min(1)).min(1),
  oldKeyFingerprint: z.string().min(6),
  assets: z.array(z.object({
    assetId: z.string().min(1),
    ingestionState: z.enum(["uploaded", "accepted"]),
    processingJob: z.enum(["queued", "transcoding", "ready"]),
    creatorDelivery: z.enum(["held", "published"])
  })).min(1)
});

export type RotationRequest = z.infer<typeof rotationRequestSchema>;

export type RotationResult = {
  temporaryKeyId: string;
  replacementKey: string;
  activeOldKeyDeployments: string[];
  oldTemporaryKeyRevoked: boolean;
  delivery: Array<{ assetId: string; state: "held" | "deliverable" }>;
};

export interface RotationApi {
  createTemporaryKey: InfraiClient["createTemporaryKey"];
  rotateTemporaryKey: InfraiClient["rotateTemporaryKey"];
  searchLogs: InfraiClient["searchLogs"];
  revokeTemporaryKey: InfraiClient["revokeTemporaryKey"];
}

export async function rotateMediaKey(
  api: RotationApi,
  input: RotationRequest,
  operationId = randomUUID()
): Promise<RotationResult> {
  const temporary = await api.createTemporaryKey({
    project_id: input.projectId,
    name: "media-key-rotation-probe",
    scopes: ["logs:read"],
    idempotency_key: `${operationId}:create`
  });

  try {
    const replacement = await api.rotateTemporaryKey(temporary.id, {
      grace_hours: input.graceHours,
      idempotency_key: `${operationId}:rotate`
    });

    const records = await api.searchLogs();
    const activeOldKeyDeployments = deploymentsUsingFingerprint(
      records,
      input.deployments,
      input.oldKeyFingerprint
    );

    return {
      temporaryKeyId: temporary.id,
      replacementKey: replacement.key,
      activeOldKeyDeployments,
      oldTemporaryKeyRevoked: true,
      delivery: input.assets.map((asset) => ({
        assetId: asset.assetId,
        state: asset.ingestionState === "accepted" &&
          asset.processingJob === "ready" &&
          asset.creatorDelivery === "published" ? "deliverable" : "held"
      }))
    };
  } finally {
    await api.revokeTemporaryKey(temporary.id);
  }
}

export function deploymentsUsingFingerprint(
  records: unknown[],
  deployments: string[],
  fingerprint: string
): string[] {
  const needle = fingerprint.toLowerCase();
  return deployments.filter((deployment) => records.some((record) => {
    const searchable = JSON.stringify(record).toLowerCase();
    return searchable.includes(deployment.toLowerCase()) && searchable.includes(needle);
  }));
}

export function fingerprintKey(key: string): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 12);
}
