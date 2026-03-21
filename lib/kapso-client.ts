import { WhatsAppClient } from "@kapso/whatsapp-cloud-api";

let _client: WhatsAppClient | null = null;

export function getWhatsAppClient(): WhatsAppClient {
  if (_client) return _client;
  const key = process.env.KAPSO_API_KEY;
  if (!key) {
    throw new Error("KAPSO_API_KEY is not set");
  }
  _client = new WhatsAppClient({
    baseUrl: process.env.KAPSO_WHATSAPP_BASE_URL ?? "https://api.kapso.ai/meta/whatsapp",
    kapsoApiKey: key,
    graphVersion: process.env.META_GRAPH_VERSION ?? "v24.0",
  });
  return _client;
}

export function chunkText(text: string, max = 3500): string[] {
  if (text.length <= max) return [text];
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + max));
    i += max;
  }
  return chunks;
}

export async function sendWhatsAppText(phoneNumberId: string, toWaId: string, body: string) {
  const client = getWhatsAppClient();
  const to = toWaId.startsWith("+") ? toWaId : `+${toWaId}`;
  for (const part of chunkText(body)) {
    await client.messages.sendText({
      phoneNumberId,
      to,
      body: part,
    });
  }
}
