import { createHash } from "crypto";
import { eq, or } from "drizzle-orm";
import { getDb, schema } from "./index";

const { players, pairs, processedMessages, sharedSessions } = schema;

export async function getPlayer(waId: string) {
  const db = getDb();
  const row = await db.select().from(players).where(eq(players.waId, waId)).limit(1);
  return row[0] ?? null;
}

export async function upsertPlayer(
  waId: string,
  patch: Partial<typeof players.$inferInsert>,
) {
  const db = getDb();
  const now = new Date();
  await db
    .insert(players)
    .values({
      waId,
      updatedAt: now,
      ...patch,
    })
    .onConflictDoUpdate({
      target: players.waId,
      set: { ...patch, updatedAt: now },
    });
}

export async function findPairForWa(waId: string) {
  const db = getDb();
  const row = await db
    .select()
    .from(pairs)
    .where(or(eq(pairs.waIdA, waId), eq(pairs.waIdB, waId)))
    .limit(1);
  return row[0] ?? null;
}

export async function getPlayerByWa(waId: string) {
  return getPlayer(waId);
}

/** Stable fingerprint for the current Gemini API key (not reversible). */
export function fingerprintGeminiApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey, "utf8").digest("hex").slice(0, 24);
}

/** Clear server-side interaction chain (explicit NULL; avoids upsert null quirks). */
export async function clearLastInteractionId(waId: string) {
  const db = getDb();
  await db
    .update(players)
    .set({ lastInteractionId: null, updatedAt: new Date() })
    .where(eq(players.waId, waId));
}

export async function createPair(params: {
  duoId: string;
  waIdA: string;
  waIdB: string;
}) {
  const db = getDb();
  await db.insert(pairs).values({
    duoId: params.duoId,
    waIdA: params.waIdA,
    waIdB: params.waIdB,
    consentA: true,
    consentB: true,
    sessionPhase: "duo_pre",
    createdAt: new Date(),
  });
}

export async function updatePairSessionPhase(duoId: string, phase: string) {
  const db = getDb();
  await db.update(pairs).set({ sessionPhase: phase }).where(eq(pairs.duoId, duoId));
}

export async function upsertSharedSession(params: {
  id: string;
  duoId: string;
  phase: string;
  notes?: string;
  matchDate?: string;
}) {
  const db = getDb();
  const now = new Date();
  const existingRows = await db
    .select()
    .from(sharedSessions)
    .where(eq(sharedSessions.id, params.id))
    .limit(1);
  const existing = existingRows[0];
  if (existing) {
    await db
      .update(sharedSessions)
      .set({
        phase: params.phase,
        notes: params.notes ?? existing.notes,
        matchDate: params.matchDate ?? existing.matchDate,
        updatedAt: now,
      })
      .where(eq(sharedSessions.id, params.id));
    return;
  }
  await db.insert(sharedSessions).values({
    id: params.id,
    duoId: params.duoId,
    phase: params.phase,
    notes: params.notes,
    matchDate: params.matchDate,
    updatedAt: now,
  });
}

export async function wasMessageProcessed(messageId: string) {
  const db = getDb();
  const row = await db
    .select()
    .from(processedMessages)
    .where(eq(processedMessages.messageId, messageId))
    .limit(1);
  return row.length > 0;
}

export async function markMessageProcessed(messageId: string) {
  const db = getDb();
  await db
    .insert(processedMessages)
    .values({ messageId, processedAt: new Date() })
    .onConflictDoNothing({ target: processedMessages.messageId });
}

/** First insert wins — use inside webhook worker to dedupe concurrent deliveries. */
export async function tryClaimMessageForProcessing(messageId: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .insert(processedMessages)
    .values({ messageId, processedAt: new Date() })
    .onConflictDoNothing({ target: processedMessages.messageId })
    .returning({ messageId: processedMessages.messageId });
  return rows.length > 0;
}

export async function deleteProcessedMessage(messageId: string) {
  const db = getDb();
  await db.delete(processedMessages).where(eq(processedMessages.messageId, messageId));
}
