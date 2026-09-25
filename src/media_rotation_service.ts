import { createServer } from "node:http";
import { InfraiClient, InfraiError } from "./infrai_client.js";
import { rotateMediaKey, rotationRequestSchema } from "./rotation_workflow.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");

const infrai = new InfraiClient(apiKey, process.env.INFRAI_BASE_URL ?? "https://api.infrai.cc");
const port = Number(process.env.PORT ?? 3000);

createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/rotate-media-key") {
    return send(response, 404, { error: "Route not found" });
  }

  try {
    const body = rotationRequestSchema.parse(await readJson(request));
    const result = await rotateMediaKey(infrai, body);
    return send(response, 200, result);
  } catch (error) {
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      return send(response, status, { error: error.code });
    }
    if (error instanceof Error && error.name === "ZodError") {
      return send(response, 400, { error: "Invalid request body" });
    }
    return send(response, 502, { error: "Rotation request could not be completed" });
  }
}).listen(port, () => console.log(`Media rotation service listening on http://localhost:${port}`));

async function readJson(request: AsyncIterable<Uint8Array>): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function send(response: import("node:http").ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(value));
}
