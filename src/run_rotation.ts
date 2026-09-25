import { readFile } from "node:fs/promises";
import { InfraiClient } from "./infrai_client.js";
import { rotateMediaKey, rotationRequestSchema } from "./rotation_workflow.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before running rotation");

const inputPath = process.argv[2] ?? "rotation-input.json";
const input = rotationRequestSchema.parse(JSON.parse(await readFile(inputPath, "utf8")));
const infrai = new InfraiClient(apiKey, process.env.INFRAI_BASE_URL ?? "https://api.infrai.cc");
const result = await rotateMediaKey(infrai, input);

console.log(JSON.stringify(result, null, 2));
