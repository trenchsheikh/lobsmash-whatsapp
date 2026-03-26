const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

function maxVideoBytes(): number {
  const raw = process.env.MAX_VIDEO_DOWNLOAD_BYTES;
  if (raw && /^\d+$/.test(raw)) return Math.min(parseInt(raw, 10), 100 * 1024 * 1024);
  return 32 * 1024 * 1024;
}

export async function downloadMediaFromUrl(
  url: string,
): Promise<{ base64: string; mimeType: string }> {
  return downloadMediaFromUrlWithLimit(url, MAX_IMAGE_BYTES);
}

/** Larger limit for padel clips sent as video (Gemini multimodal). */
export async function downloadVideoFromUrl(
  url: string,
): Promise<{ base64: string; mimeType: string }> {
  return downloadMediaFromUrlWithLimit(url, maxVideoBytes());
}

async function downloadMediaFromUrlWithLimit(
  url: string,
  maxBytes: number,
): Promise<{ base64: string; mimeType: string }> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`media fetch failed ${res.status}`);
  }
  const len = res.headers.get("content-length");
  if (len && Number(len) > maxBytes) {
    throw new Error("media too large");
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) {
    throw new Error("media too large");
  }
  const mimeType = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
  return {
    base64: buf.toString("base64"),
    mimeType,
  };
}
