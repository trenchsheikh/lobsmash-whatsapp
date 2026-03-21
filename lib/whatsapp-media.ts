import { getWhatsAppClient } from "./kapso-client";

export async function downloadInboundMedia(params: {
  phoneNumberId: string;
  mediaId: string;
}): Promise<{ base64: string; mimeType: string }> {
  const client = getWhatsAppClient();
  const meta = await client.media.get({
    mediaId: params.mediaId,
    phoneNumberId: params.phoneNumberId,
  });
  const buf = await client.media.download({
    mediaId: params.mediaId,
    phoneNumberId: params.phoneNumberId,
    as: "arrayBuffer",
  });
  const m = meta as { mime_type?: string; mimeType?: string };
  const mimeType = m.mime_type ?? m.mimeType ?? "image/jpeg";
  return {
    base64: Buffer.from(buf as ArrayBuffer).toString("base64"),
    mimeType,
  };
}
