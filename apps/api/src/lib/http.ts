import type { IncomingMessage, ServerResponse } from "node:http";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type,authorization"
};

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
    ...CORS_HEADERS,
    "content-type": "application/json; charset=utf-8",
    ...headers
  });
  response.end(JSON.stringify(payload, null, 2));
}

export function sendNoContent(response: ServerResponse, statusCode = 204) {
  response.writeHead(statusCode, CORS_HEADERS);
  response.end();
}

export function sendRedirect(
  response: ServerResponse,
  location: string,
  statusCode = 302
) {
  response.writeHead(statusCode, {
    ...CORS_HEADERS,
    location
  });
  response.end();
}

export function withCorsHeaders(headers?: Record<string, string>) {
  return {
    ...CORS_HEADERS,
    ...headers
  };
}

export function getPathname(requestUrl: string | undefined) {
  return new URL(requestUrl ?? "/", "http://localhost").pathname;
}

export function getRequestUrl(requestUrl: string | undefined) {
  return new URL(requestUrl ?? "/", "http://localhost");
}
