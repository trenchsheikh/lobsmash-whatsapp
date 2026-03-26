import crypto from "crypto";

/** HMAC-SHA256 hex of raw body, compared to `x-webhook-signature` (when a shared secret is configured). */
export function verifyWebhookHmacSha256Hex(
  rawBody: Buffer,
  signatureHeader: string | null,
  secret: string | undefined,
): boolean {
  if (!secret) return true;
  if (!signatureHeader) return false;
  const h = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    const a = Buffer.from(h, "utf8");
    const b = Buffer.from(signatureHeader, "utf8");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * If `WASSIST_WEBHOOK_SECRET` is set, require matching `x-webhook-signature` (HMAC-SHA256 hex).
 * Else if `WASSIST_WEBHOOK_HEADER_NAME` + `WASSIST_WEBHOOK_HEADER_VALUE` are set, require that header.
 * Else allow (rely on secret URL / edge protection).
 */
export function verifyWassistWebhookRequest(req: Request, rawBody: Buffer): boolean {
  const secret = process.env.WASSIST_WEBHOOK_SECRET;
  if (secret) {
    return verifyWebhookHmacSha256Hex(rawBody, req.headers.get("x-webhook-signature"), secret);
  }
  const hName = process.env.WASSIST_WEBHOOK_HEADER_NAME;
  const hVal = process.env.WASSIST_WEBHOOK_HEADER_VALUE;
  if (hName && hVal) {
    return req.headers.get(hName.toLowerCase()) === hVal;
  }
  return true;
}
