import type { Pair } from "../db/schema";
import type { CoachMode } from "./types";

export function inferCoachMode(userText: string, pair: Pair | null): CoachMode {
  if (!pair) return "solo";
  const t = userText.toLowerCase();
  if (
    /\b(post match|post-match|after the match|after match|we (just )?finished|full time)\b/.test(t) ||
    /\b(lost|won)\b/.test(t)
  ) {
    return "duo_post";
  }
  if (
    /\b(pre match|pre-match|before (the )?match|tonight|tomorrow|later today)\b/.test(t) ||
    /\bstrategy|game plan|roles\b/.test(t)
  ) {
    return "duo_pre";
  }
  if (pair.sessionPhase === "duo_post") return "duo_post";
  return "duo_pre";
}
