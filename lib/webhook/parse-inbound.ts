import crypto from "crypto";

export type InboundWassistMessage = {
  messageId: string;
  waId: string;
  text: string;
  messageType: string;
  imageUrl?: string;
  videoUrl?: string;
  replyCallback: string;
};

export function normalizeWaId(phone: string): string {
  return phone.replace(/\D/g, "");
}

function sha256Hex(s: string): string {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

/**
 * Stable id for deduping: prefer platform ids, else hash reply_callback (unique per BYOA delivery),
 * else hash of phone + message + media URLs.
 */
export function deriveWassistMessageId(body: Record<string, unknown>): string {
  const mid = body.message_id ?? body.messageId ?? body.id ?? body.wa_message_id;
  if (typeof mid === "string" && mid.trim() !== "") return mid;

  const cb = body.reply_callback;
  if (typeof cb === "string" && cb.trim() !== "") {
    return `wassist_cb_${sha256Hex(cb)}`;
  }

  const phone = String(body.phone_number ?? "");
  const msg = String(body.message ?? "");
  const image = body.image != null ? String(body.image) : "";
  const video = body.video != null ? String(body.video) : "";
  return `wassist_h_${sha256Hex(`${phone}\0${msg}\0${image}\0${video}`)}`;
}

function pickHttpMediaUrl(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  if (t.startsWith("https://") || t.startsWith("http://")) return t;
  return undefined;
}

/** Some providers put a video file URL in `image` — detect by extension. */
function looksLikeVideoFileUrl(url: string): boolean {
  return /\.(mp4|mov|webm|m4v|3gp|avi|mkv)(\?|#|$)/i.test(url);
}

/**
 * Wassist BYOA inbound shape:
 * @see https://docs.wassist.app/concepts/bring-your-own-agent#step-2-implement-your-webhook
 */
export function parseWassistInbound(body: Record<string, unknown>): InboundWassistMessage | null {
  const replyCallback = body.reply_callback;
  if (typeof replyCallback !== "string" || replyCallback.trim() === "") {
    return null;
  }

  const phone = body.phone_number;
  if (typeof phone !== "string" || phone.trim() === "") {
    return null;
  }

  const text = typeof body.message === "string" ? body.message : "";
  const rawImage = pickHttpMediaUrl(body.image);
  const rawVideo = pickHttpMediaUrl(body.video);
  const videoUrl =
    rawVideo ?? (rawImage && looksLikeVideoFileUrl(rawImage) ? rawImage : undefined);
  const imageUrl = videoUrl && rawImage === videoUrl ? undefined : rawImage;

  const messageId = deriveWassistMessageId(body);

  if (!text.trim() && !imageUrl && !videoUrl) {
    return null;
  }

  let messageType = "text";
  if (videoUrl) messageType = "video";
  else if (imageUrl) messageType = "image";

  return {
    messageId,
    waId: normalizeWaId(phone),
    text,
    messageType,
    imageUrl,
    videoUrl,
    replyCallback: replyCallback.trim(),
  };
}
