import crypto from "crypto";

export function verifyKapsoSignature(
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
