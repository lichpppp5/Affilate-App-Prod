import type { IncomingMessage, ServerResponse } from "node:http";

export async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return {} as T;
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

export function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
  headers?: Record<string, string>
) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    ...headers
  });
  response.end(JSON.stringify(payload, null, 2));
}

export function sendNoContent(response: ServerResponse, statusCode = 204) {
  response.writeHead(statusCode);
  response.end();
}

export function getPathname(requestUrl: string | undefined) {
  return new URL(requestUrl ?? "/", "http://localhost").pathname;
}

