export type InboundKapsoMessage = {
  messageId: string;
  waId: string;
  phoneNumberId: string;
  text: string;
  messageType: string;
  mediaId?: string;
};

export function normalizeWaId(phone: string): string {
  return phone.replace(/\D/g, "");
}

/**
 * Kapso may send `data` as a single object (v2 doc) or as an array when batching is enabled.
 */
function expandToEventRoots(body: Record<string, unknown>): Record<string, unknown>[] {
  const data = body.data;
  if (Array.isArray(data)) {
    return data.filter(
      (x): x is Record<string, unknown> =>
        x !== null && typeof x === "object" && !Array.isArray(x),
    );
  }
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return [data as Record<string, unknown>];
  }
  return [body];
}

function pickSenderPhone(
  msg: Record<string, unknown>,
  conv: Record<string, unknown> | undefined,
): string | undefined {
  const convPhone = conv?.phone_number;
  if (convPhone != null && String(convPhone).trim() !== "") {
    return String(convPhone);
  }
  const from = msg.from;
  if (typeof from === "string" && from.trim() !== "") return from;
  if (typeof from === "number" && Number.isFinite(from)) return String(from);
  return undefined;
}

/**
 * Parse one Kapso event object (has `message`, `conversation`, optional `phone_number_id`).
 */
function parseSingleInbound(root: Record<string, unknown>): InboundKapsoMessage | null {
  const msg = root.message as Record<string, unknown> | undefined;
  if (!msg) return null;

  const kapso = msg.kapso as Record<string, unknown> | undefined;
  /** Delivery / sent / failed status webhooks for bot replies — not user input. */
  if (kapso?.direction === "outbound") return null;

  const conv = root.conversation as Record<string, unknown> | undefined;
  const phone = pickSenderPhone(msg, conv);
  if (!phone) return null;

  const waId = normalizeWaId(phone);
  const id = String(msg.id ?? "");
  if (!id) return null;

  const messageType = String(msg.type ?? "text");
  let text = "";
  if (messageType === "text") {
    const t = msg.text as { body?: string } | undefined;
    text = t?.body ?? "";
  } else if (typeof kapso?.content === "string") {
    text = kapso.content;
  }

  const phoneNumberId = String(root.phone_number_id ?? conv?.phone_number_id ?? "");

  let mediaId: string | undefined;
  if (messageType === "image") {
    mediaId = (msg.image as { id?: string } | undefined)?.id;
  }
  if (messageType === "video") {
    mediaId = (msg.video as { id?: string } | undefined)?.id;
  }

  return {
    messageId: id,
    waId,
    phoneNumberId,
    text,
    messageType,
    mediaId,
  };
}

/**
 * All inbound user messages from a webhook body (handles batch `data: [...]`).
 */
export function parseKapsoInboundBatch(body: Record<string, unknown>): InboundKapsoMessage[] {
  const roots = expandToEventRoots(body);
  const out: InboundKapsoMessage[] = [];
  for (const root of roots) {
    const parsed = parseSingleInbound(root);
    if (parsed) out.push(parsed);
  }
  return out;
}

/**
 * First inbound message only (backward compatible).
 */
export function parseKapsoInbound(body: Record<string, unknown>): InboundKapsoMessage | null {
  const batch = parseKapsoInboundBatch(body);
  return batch[0] ?? null;
}
