import { NextResponse } from "next/server";
import { verifyKapsoSignature } from "@/lib/webhook/signature";
import {
  parseKapsoInboundBatch,
  type InboundKapsoMessage,
} from "@/lib/webhook/parse-inbound";
import * as q from "@/lib/db/queries";
import { getDb } from "@/lib/db/index";
import { handlePartnerIntent, handlePairCode, parsePairCommand } from "@/lib/partner-flow";
import { buildMemoryBlock } from "@/lib/coach/memory-block";
import { inferCoachMode } from "@/lib/coach/mode";
import { runLobSmashCoach } from "@/lib/coach/run-lob-smash";
import { sendWhatsAppText } from "@/lib/kapso-client";
import { downloadInboundMedia } from "@/lib/whatsapp-media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Gemini + DB can exceed default 10s on cold starts; Vercel Pro+ can raise max. */
export const maxDuration = 60;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const verify = process.env.META_VERIFY_TOKEN;
  if (mode === "subscribe" && challenge && verify && token === verify) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ ok: true, service: "lobsmash-coach" });
}

async function processOneInbound(inbound: InboundKapsoMessage): Promise<void> {
  const { waId, text, messageType, mediaId } = inbound;
  const phoneNumberId =
    inbound.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || "";
  if (!phoneNumberId) {
    console.warn("lobsmash: skipped inbound — no phone_number_id", inbound.messageId);
    return;
  }

  const code = parsePairCommand(text);
  if (code) {
    const msg = await handlePairCode(waId, code);
    await sendWhatsAppText(phoneNumberId, waId, msg);
    return;
  }

  const partnerEarly = await handlePartnerIntent(waId, text);
  if (partnerEarly) {
    await sendWhatsAppText(phoneNumberId, waId, partnerEarly.reply);
    return;
  }

  await q.upsertPlayer(waId, {});

  const pair = await q.findPairForWa(waId);
  const coachMode = inferCoachMode(text, pair);
  const memoryBlock = await buildMemoryBlock(waId);

  let media:
    | {
        kind: "image";
        mimeType: string;
        base64: string;
      }
    | {
        kind: "video";
        mimeType: string;
        base64: string;
      }
    | undefined;

  if (mediaId && (messageType === "image" || messageType === "video")) {
    try {
      const downloaded = await downloadInboundMedia({ phoneNumberId, mediaId });
      media =
        messageType === "video"
          ? {
              kind: "video",
              base64: downloaded.base64,
              mimeType: downloaded.mimeType,
            }
          : {
              kind: "image",
              base64: downloaded.base64,
              mimeType: downloaded.mimeType,
            };
    } catch (e) {
      console.error("media download failed", e);
    }
  }

  const reply = await runLobSmashCoach({
    ctx: {
      waId,
      coachMode,
      memoryBlock,
      duoId: pair?.duoId,
    },
    userText: text || `[${messageType} message]`,
    media,
  });

  await sendWhatsAppText(phoneNumberId, waId, reply);
}

export async function POST(req: Request) {
  const raw = Buffer.from(await req.arrayBuffer());
  const sig = req.headers.get("x-webhook-signature");
  if (!verifyKapsoSignature(raw, sig, process.env.KAPSO_WEBHOOK_SECRET)) {
    return new NextResponse("invalid signature", { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw.toString("utf8")) as Record<string, unknown>;
  } catch {
    return new NextResponse("bad json", { status: 400 });
  }

  const inbounds = parseKapsoInboundBatch(body);
  if (inbounds.length === 0) {
    return NextResponse.json({ ok: true, parsed: 0 });
  }

  let processed = 0;
  let failed = 0;

  try {
    getDb();

    for (const inbound of inbounds) {
      try {
        if (await q.wasMessageProcessed(inbound.messageId)) {
          console.warn("lobsmash: skip duplicate webhook delivery", inbound.messageId);
          continue;
        }

        await processOneInbound(inbound);
        await q.markMessageProcessed(inbound.messageId);
        processed += 1;
      } catch (e) {
        console.error("lobsmash: inbound failed", inbound.messageId, e);
        failed += 1;
        const phoneNumberId =
          inbound.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || "";
        if (phoneNumberId) {
          try {
            await sendWhatsAppText(
              phoneNumberId,
              inbound.waId,
              "Something went wrong on the coach server — try again in a moment.",
            );
          } catch {
            /* ignore */
          }
        }
      }
    }
  } catch (e) {
    console.error("lobsmash: webhook fatal (DB init or batch)", e);
    return NextResponse.json(
      {
        ok: false,
        error: "internal",
        hint:
          process.env.NODE_ENV === "development"
            ? e instanceof Error
              ? e.message
              : String(e)
            : undefined,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    batch: inbounds.length,
    processed,
    failed,
  });
}
