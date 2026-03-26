const MAX_MEDIA_BYTES = 15 * 1024 * 1024;

export async function downloadMediaFromUrl(
  url: string,
): Promise<{ base64: string; mimeType: string }> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`media fetch failed ${res.status}`);
  }
  const len = res.headers.get("content-length");
  if (len && Number(len) > MAX_MEDIA_BYTES) {
    throw new Error("media too large");
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_MEDIA_BYTES) {
    throw new Error("media too large");
  }
  const mimeType = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
  return {
    base64: buf.toString("base64"),
    mimeType,
  };
}
