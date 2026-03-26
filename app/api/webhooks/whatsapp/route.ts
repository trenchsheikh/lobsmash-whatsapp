import { after } from "next/server";
import { NextResponse } from "next/server";
import { verifyWassistWebhookRequest } from "@/lib/webhook/signature";
import { parseWassistInbound, type InboundWassistMessage } from "@/lib/webhook/parse-inbound";
import * as q from "@/lib/db/queries";
import { getDb } from "@/lib/db/index";
import { handlePartnerIntent, handlePairCode, parsePairCommand } from "@/lib/partner-flow";
import { buildMemoryBlock } from "@/lib/coach/memory-block";
import { inferCoachMode } from "@/lib/coach/mode";
import { runLobSmashCoach } from "@/lib/coach/run-lob-smash";
import { downloadMediaFromUrl } from "@/lib/whatsapp-media";
import { postReplyCallbackTextChunks, postReplyCallback } from "@/lib/wassist/reply";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Gemini + DB can exceed default 10s on cold starts; `after()` delivers via reply_callback. */
export const maxDuration = 60;

const NO_CUSTOMER_REPLY = { content: "No CUSTOMER message reply" } as const;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const verify = process.env.META_VERIFY_TOKEN;
  if (mode === "subscribe" && challenge && verify && token === verify) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ ok: true, service: "lobsmash-coach", channel: "wassist" });
}

async function buildCoachReply(inbound: InboundWassistMessage): Promise<string> {
  const { waId, text, messageType, imageUrl, videoUrl } = inbound;

  const code = parsePairCommand(text);
  if (code) {
    return handlePairCode(waId, code);
  }

  const partnerEarly = await handlePartnerIntent(waId, text);
  if (partnerEarly) {
    return partnerEarly.reply;
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

  const mediaUrl = messageType === "video" ? videoUrl : imageUrl;
  if (mediaUrl && (messageType === "image" || messageType === "video")) {
    try {
      const downloaded = await downloadMediaFromUrl(mediaUrl);
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

  return runLobSmashCoach({
    ctx: {
      waId,
      coachMode,
      memoryBlock,
      duoId: pair?.duoId,
    },
    userText: text || `[${messageType} message]`,
    media,
  });
}

export async function POST(req: Request) {
  const raw = Buffer.from(await req.arrayBuffer());

  if (!verifyWassistWebhookRequest(req, raw)) {
    return new NextResponse("invalid signature", { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw.toString("utf8")) as Record<string, unknown>;
  } catch {
    return new NextResponse("bad json", { status: 400 });
  }

  const inbound = parseWassistInbound(body);
  if (!inbound) {
    return NextResponse.json({
      ok: true,
      coachRan: false,
      thisIsNotAnError: true,
      skippedReason: "no_inbound_message",
      parsed: 0,
      hint: "Expected Wassist BYOA JSON: message, phone_number, reply_callback (see Wassist docs).",
    });
  }

  try {
    getDb();
  } catch (e) {
    console.error("lobsmash: DB init failed", e);
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

  after(async () => {
    const claimed = await q.tryClaimMessageForProcessing(inbound.messageId);
    if (!claimed) {
      console.warn("lobsmash: skip duplicate webhook delivery", inbound.messageId);
      return;
    }
    try {
      const reply = await buildCoachReply(inbound);
      await postReplyCallbackTextChunks(inbound.replyCallback, reply);
    } catch (e) {
      console.error("lobsmash: inbound failed", inbound.messageId, e);
      let notified = false;
      try {
        await postReplyCallback(
          inbound.replyCallback,
          "Something went wrong on the coach server — try again in a moment.",
        );
        notified = true;
      } catch {
        /* ignore */
      }
      if (!notified) {
        await q.deleteProcessedMessage(inbound.messageId);
      }
    }
  });

  return NextResponse.json(NO_CUSTOMER_REPLY);
}
