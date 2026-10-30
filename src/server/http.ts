// ABOUTME: Same-origin and byte-bounded JSON parsing shared by every application endpoint.
// ABOUTME: One year of structured diary records can exceed 100 kB; parsing stops at the shared 1 MB limit.
export const MAX_JSON_BYTES = 1_000_000;
export async function readApplicationJson(request: Request): Promise<unknown> {
  const origin = request.headers.get("origin");
  if (origin) {
    let host: string;
    try {
      host = new URL(origin).host;
    } catch {
      throw new HttpError(403, "Invalid request origin.");
    }
    if (host !== (request.headers.get("host") || new URL(request.url).host))
      throw new HttpError(403, "Use this application's own page.");
  }
  if (Number(request.headers.get("content-length") || 0) > MAX_JSON_BYTES)
    throw new HttpError(413, "This request is too large.");
  const reader = request.body?.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  if (reader)
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_JSON_BYTES) {
          await reader.cancel();
          throw new HttpError(413, "This request is too large.");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new HttpError(400, "Send valid JSON.");
  }
}
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function errorResponse(error: unknown) {
  return Response.json(
    {
      error:
        error instanceof Error
          ? error.message
          : "The request could not be completed.",
    },
    {
      status: error instanceof HttpError ? error.status : 400,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
