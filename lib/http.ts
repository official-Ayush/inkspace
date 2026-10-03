/** Small, bounded JSON requests; drawings travel directly to private storage. */
export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

export function jsonNoStore(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Cache-Control', 'private, no-store, max-age=0');
  headers.set('Vary', 'Cookie');
  headers.set('X-Content-Type-Options', 'nosniff');
  return Response.json(data, { ...init, headers });
}

export function failure(error: unknown) {
  if (error instanceof HttpError) return jsonNoStore({ error: error.message }, { status: error.status });
  // Do not log request bodies, cookies, signed URLs, or provider credentials.
  console.error('Inkspace request failed', error instanceof Error ? error.name : 'UnknownError');
  return jsonNoStore({ error: 'Your workspace is temporarily unavailable. Please try again; your open drawing is kept on screen.' }, { status: 503 });
}

export function assertSameOrigin(req: Request) {
  const origin = req.headers.get('origin');
  const fetchSite = req.headers.get('sec-fetch-site');
  const expected = new URL(req.url).origin;
  if (!origin || origin !== expected || (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none')) {
    throw new HttpError(403, 'Request not allowed.');
  }
  if (req.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    throw new HttpError(415, 'Send a JSON request.');
  }
}

export async function readJson(req: Request, maxBytes = 16_384): Promise<Record<string, unknown>> {
  const length = req.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes)) {
    throw new HttpError(413, 'Request is too large.');
  }
  if (!req.body) throw new HttpError(400, 'A JSON request body is required.');
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new HttpError(413, 'Request is too large.');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let body: unknown;
  try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new HttpError(400, 'Invalid JSON request.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'A JSON object is required.');
  return body as Record<string, unknown>;
}
