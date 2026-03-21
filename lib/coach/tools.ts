import { nanoid } from "nanoid";
import { buildPlaytomicHelpMessage, type PlaytomicHelpInput } from "../playtomic-links";
import * as q from "../db/queries";
import type { CoachContext } from "./types";

export const LOBSMASH_TOOLS = [
  {
    type: "function" as const,
    name: "update_player_memory",
    description:
      "Update this WhatsApp user's saved coaching memory (weaknesses, recent advice, last goal, improvement notes). Only include fields you are changing.",
    parameters: {
      type: "object",
      properties: {
        weaknesses: { type: "string", description: "Short bullet list of main weaknesses" },
        advice_added: { type: "string", description: "One new tip to append to history" },
        last_goal: { type: "string", description: "Goal for next session" },
        improvement_notes: { type: "string", description: "How they're progressing" },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "update_duo_session",
    description:
      "Update shared duo session notes for a pair (pre/post match). Use when both players are in context.",
    parameters: {
      type: "object",
      properties: {
        phase: { type: "string", enum: ["pre", "post"] },
        notes: { type: "string", description: "Joint summary" },
        match_date: { type: "string", description: "ISO date or human text" },
      },
      required: ["phase", "notes"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "get_playtomic_booking_help",
    description:
      "Return curated Playtomic links and guidance. Use when user wants to book or find padel games.",
    parameters: {
      type: "object",
      properties: {
        city: { type: "string" },
        country: { type: "string" },
        intent: { type: "string", enum: ["book_court", "find_open_match"] },
        date_hint: { type: "string" },
      },
      additionalProperties: false,
    },
  },
];

export async function executeToolCall(
  name: string,
  args: Record<string, unknown>,
  ctx: CoachContext & { duoId?: string },
): Promise<string> {
  switch (name) {
    case "update_player_memory": {
      const p = await q.getPlayer(ctx.waId);
      const advice =
        args.advice_added && typeof args.advice_added === "string"
          ? [p?.adviceHistory, args.advice_added].filter(Boolean).join("\n---\n")
          : p?.adviceHistory;
      await q.upsertPlayer(ctx.waId, {
        weaknesses: typeof args.weaknesses === "string" ? args.weaknesses : p?.weaknesses,
        adviceHistory: advice,
        lastGoal: typeof args.last_goal === "string" ? args.last_goal : p?.lastGoal,
        improvementNotes:
          typeof args.improvement_notes === "string"
            ? args.improvement_notes
            : p?.improvementNotes,
      });
      return "Saved player memory.";
    }
    case "update_duo_session": {
      if (!ctx.duoId) return "No active duo pair in context; skipped.";
      const phase = args.phase === "post" ? "post" : "pre";
      const notes = String(args.notes ?? "");
      const matchDate = typeof args.match_date === "string" ? args.match_date : undefined;
      await q.upsertSharedSession({
        id: ctx.duoId,
        duoId: ctx.duoId,
        phase,
        notes,
        matchDate,
      });
      await q.updatePairSessionPhase(ctx.duoId, phase === "post" ? "duo_post" : "duo_pre");
      return "Saved duo session notes.";
    }
    case "get_playtomic_booking_help": {
      const input: PlaytomicHelpInput = {
        city: typeof args.city === "string" ? args.city : undefined,
        country: typeof args.country === "string" ? args.country : undefined,
        intent:
          args.intent === "find_open_match" || args.intent === "book_court"
            ? args.intent
            : undefined,
        date_hint: typeof args.date_hint === "string" ? args.date_hint : undefined,
      };
      return buildPlaytomicHelpMessage(input);
    }
    default:
      return `Unknown tool ${name}`;
  }
}

export function makeDuoId(): string {
  return nanoid(12);
}
