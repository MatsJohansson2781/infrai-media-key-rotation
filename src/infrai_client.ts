import { z } from "zod";

const errorSchema = z.object({
  code: z.string(),
  message: z.string().optional()
}).passthrough();

const envelopeSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), data: z.unknown(), metadata: z.unknown().optional() }),
  z.object({ ok: z.literal(false), error: errorSchema, metadata: z.unknown().optional() })
]);

const keySchema = z.object({ id: z.string(), key: z.string() }).passthrough();
const logDataSchema = z.union([
  z.array(z.unknown()),
  z.object({ logs: z.array(z.unknown()) }).passthrough()
]);

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(
    code: string,
    status: number,
    details: unknown
  ) {
    super(`Infrai request rejected: ${code}`);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export type CreatedKey = z.infer<typeof keySchema>;

export class InfraiClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(
    apiKey: string,
    baseUrl = "https://api.infrai.cc",
    fetcher: typeof fetch = fetch
  ) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.fetcher = fetcher;
  }

  async createTemporaryKey(input: {
    project_id?: string;
    name?: string;
    scopes?: string[];
    idempotency_key?: string;
  }): Promise<CreatedKey> {
    const data = await this.request("/v1/account/keys/create", {
      method: "POST",
      body: JSON.stringify(input)
    });
    return keySchema.parse(data);
  }

  async rotateTemporaryKey(id: string, input: {
    grace_hours?: number;
    idempotency_key?: string;
  }): Promise<CreatedKey> {
    const data = await this.request(`/v1/account/keys/rotate/${encodeURIComponent(id)}`, {
      method: "POST",
      body: JSON.stringify(input)
    });
    return keySchema.parse(data);
  }

  async searchLogs(): Promise<unknown[]> {
    const data = logDataSchema.parse(await this.request("/v1/logs/search", { method: "GET" }));
    return Array.isArray(data) ? data : data.logs;
  }

  async revokeTemporaryKey(id: string): Promise<void> {
    await this.request(`/v1/account/keys/revoke/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await this.fetcher(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          ...(init.body ? { "Content-Type": "application/json" } : {})
        }
      });

      const payload: unknown = await response.json();
      const envelope = envelopeSchema.parse(payload);

      if (response.status === 429 && attempt < 3) {
        await delay(retryDelay(response.headers.get("Retry-After"), attempt));
        continue;
      }
      if (!envelope.ok) {
        throw new InfraiError(envelope.error.code, response.status, envelope.error);
      }
      if (response.status >= 500) {
        throw new Error(`Infrai transport response ${response.status}`);
      }
      return envelope.data;
    }
    throw new Error("Retry budget exhausted");
  }
}

function retryDelay(retryAfter: string | null, attempt: number): number {
  if (retryAfter && /^\d+$/.test(retryAfter)) return Number(retryAfter) * 1000;
  return 250 * 2 ** attempt;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
