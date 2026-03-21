import { customAlphabet } from "nanoid";
import { eq } from "drizzle-orm";
import * as q from "./db/queries";
import { getDb } from "./db/index";
import { players } from "./db/schema";
import { makeDuoId } from "./coach/tools";

const codeAlphabet = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 8);

export function parsePairCommand(text: string): string | null {
  const t = text.trim();
  const m = t.match(/^pair\s+([A-Z0-9]{6,14})$/i);
  return m ? m[1].toUpperCase() : null;
}

export function extractPhoneFromText(text: string): string | null {
  const m = text.match(/\+?\d[\d\s-]{8,22}/);
  if (!m) return null;
  const digits = m[0].replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits;
}

/** Start partner linking from user A with free text mentioning a phone. */
export async function handlePartnerIntent(
  waIdA: string,
  text: string,
): Promise<{ reply: string } | null> {
  const lower = text.toLowerCase();
  if (
    !lower.includes("partner") &&
    !lower.includes("pair me") &&
    !lower.includes("add my partner")
  ) {
    return null;
  }
  const phone = extractPhoneFromText(text);
  if (!phone) {
    return {
      reply:
        "Send your partner’s number in international format, e.g. +34600111222 — I’ll give you a code for them to message me.",
    };
  }
  const code = codeAlphabet();
  await q.upsertPlayer(waIdA, {
    pendingPartnerPhone: phone,
    pendingInviteCode: code,
  });
  return {
    reply: `Got it. Ask your partner to message this number with:\n\nPAIR ${code}\n\nThey must use the WhatsApp number ending in …${phone.slice(-4)}. When they do, I’ll link you two for duo coaching (pre/post match).`,
  };
}

export async function handlePairCode(waIdB: string, code: string): Promise<string> {
  const existing = await q.findPairForWa(waIdB);
  if (existing) {
    return "You’re already linked in a duo. One pair at a time for now.";
  }

  const db = getDb();
  const rows = await db.select().from(players).where(eq(players.pendingInviteCode, code));
  const inviter = rows[0];
  if (!inviter) {
    return "That code isn’t valid. Ask your partner to resend the latest PAIR code.";
  }
  if (inviter.waId === waIdB) {
    return "You can’t pair with yourself — send this from your partner’s phone.";
  }
  if (await q.findPairForWa(inviter.waId)) {
    return "Your partner is already in another duo.";
  }
  if (inviter.pendingPartnerPhone && inviter.pendingPartnerPhone !== waIdB) {
    return "That code is for a different number. Double-check you’re messaging from the phone your partner registered.";
  }

  const waIdA = inviter.waId;
  const duoId = makeDuoId();
  await q.createPair({ duoId, waIdA, waIdB });
  await q.upsertPlayer(waIdA, {
    pendingPartnerPhone: null,
    pendingInviteCode: null,
  });

  return `You two are linked as a duo. Before your next match, message here together (or separately) and say *pre match* — I’ll help you plan roles and chemistry. After playing, say *post match* for a joint debrief.\n\nGroup WhatsApp with the bot isn’t auto-created here — if you want a 3‑way group, create one in WhatsApp and add this business number + both of you.`;
}
