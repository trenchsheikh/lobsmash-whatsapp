/**
 * Wassist BYOA reply_callback — POST JSON to deliver messages after the webhook returns.
 * @see https://docs.wassist.app/concepts/bring-your-own-agent#reply-callback
 */

const DEFAULT_CHUNK = 3500;

export function chunkText(text: string, max = DEFAULT_CHUNK): string[] {
  if (text.length <= max) return [text];
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + max));
    i += max;
  }
  return chunks;
}

export async function postReplyCallback(
  replyCallbackUrl: string,
  content: string | Record<string, unknown>,
): Promise<void> {
  const body = typeof content === "string" ? { content } : content;
  const res = await fetch(replyCallbackUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`reply_callback failed ${res.status}: ${t.slice(0, 200)}`);
  }
}

/** Send a long reply as sequential callback posts (WhatsApp-friendly chunk size). */
export async function postReplyCallbackTextChunks(
  replyCallbackUrl: string,
  text: string,
): Promise<void> {
  const parts = chunkText(text);
  for (const part of parts) {
    await postReplyCallback(replyCallbackUrl, part);
  }
}
