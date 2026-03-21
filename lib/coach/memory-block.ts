import * as q from "../db/queries";
import type { Player } from "../db/schema";

export async function buildMemoryBlock(waId: string): Promise<string> {
  const p = await q.getPlayer(waId);
  const pair = await q.findPairForWa(waId);
  let other: Player | null = null;
  if (pair) {
    const otherId = pair.waIdA === waId ? pair.waIdB : pair.waIdA;
    other = await q.getPlayer(otherId);
  }

  const lines: string[] = [];
  lines.push(`[Context] Your WhatsApp id: ${waId}`);
  if (p?.weaknesses) lines.push(`Your weaknesses (saved): ${p.weaknesses}`);
  if (p?.lastGoal) lines.push(`Your last goal: ${p.lastGoal}`);
  if (p?.improvementNotes) lines.push(`Your progress: ${p.improvementNotes}`);

  if (pair && other) {
    lines.push(`[Duo] Partner id: ${other.waId}`);
    if (other.weaknesses) lines.push(`Partner weaknesses (saved): ${other.weaknesses}`);
    if (other.lastGoal) lines.push(`Partner last goal: ${other.lastGoal}`);
    lines.push(`[Duo] Stored phase: ${pair.sessionPhase}`);
  }

  return lines.join("\n");
}
