import { readFile } from "node:fs/promises";
import { INVALID_INPUT, MODEL_TIMEOUT_MS, parseInput, triage } from "./triage.mjs";

const html = await readFile(new URL("./index.html", import.meta.url));
const uiScript = await readFile(new URL("./ui.mjs", import.meta.url));

function json(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

/** HTTP-обработчик. Модель и журнал подставляются — в тестах свои. */
export function createHandler({ classify, timeoutMs = MODEL_TIMEOUT_MS, log = console.warn } = {}) {
  async function handleTriage(request, response) {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const input = parseInput(Buffer.concat(chunks).toString("utf8"));
    if (!input.ok) return json(response, 400, INVALID_INPUT);
    const { body, reason } = await triage(classify, input.text, timeoutMs);
    if (reason) log(`triage manual_review: ${reason}`);
    return json(response, 200, body);
  }

  return async function handler(request, response) {
    if (request.method === "GET" && request.url === "/") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(html);
      return;
    }
    if (request.method === "GET" && request.url === "/ui.mjs") {
      response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
      response.end(uiScript);
      return;
    }
    if (request.method !== "POST" || request.url !== "/api/triage") {
      return json(response, 404, { status: "not_found" });
    }
    try {
      await handleTriage(request, response);
    } catch {
      if (!response.headersSent) json(response, 500, { status: "server_error" });
    }
  };
}
