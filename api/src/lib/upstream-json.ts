/** Read an external JSON response with a hard byte ceiling, even when chunked. */
export async function readBoundedJson<T>(response: Response, maxBytes: number): Promise<T> {
  const advertised = Number(response.headers.get("content-length"));
  if (Number.isFinite(advertised) && advertised > maxBytes) throw new Error("Upstream response too large");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Upstream response has no body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error("Upstream response too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), size).toString("utf8")) as T;
}
