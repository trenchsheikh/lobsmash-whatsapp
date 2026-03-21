import type { Player } from "../db/schema";

/** No saved coaching notes yet — good moment for a friendly “what is LobSmash” intro. */
export function hasMinimalPlayerMemory(p: Player | null): boolean {
  if (!p) return true;
  return (
    !p.weaknesses?.trim() &&
    !p.adviceHistory?.trim() &&
    !p.lastGoal?.trim() &&
    !p.improvementNotes?.trim()
  );
}

/** User is saying hi / opening the chat, not yet asking a concrete padel question. */
export function looksLikeGreetingOrOpening(text: string): boolean {
  const t = text.trim();
  if (t.length > 140) return false;
  const lower = t.toLowerCase();
  if (/\b(bandeja|volea|lob|drive|smash|court|match|game|error|drill|lesson)\b/i.test(t) && t.length > 20) {
    return false;
  }
  return (
    /^(hi|hey|hello|yo|hiya|sup|howdy|ola|coucou)\b[\s!.?]*$/i.test(t) ||
    /^(hi|hey|hello)\b.*\b(there|coach|lob)/i.test(t) ||
    /^what'?s up\b|^whats up\b|^good (morning|afternoon|evening)\b/i.test(lower) ||
    /^(start|begin|help|menu|info)\b[!?.\s]*$/i.test(lower) ||
    /^who are you\b|^what (is|are) (this|lob)/i.test(lower) ||
    /^how (does this|do you) work\b/i.test(lower)
  );
}

export function shouldGiveOnboardingIntro(
  p: Player | null,
  userText: string,
  hasMedia: boolean,
): boolean {
  if (hasMedia) return false;
  return hasMinimalPlayerMemory(p) && looksLikeGreetingOrOpening(userText);
}
