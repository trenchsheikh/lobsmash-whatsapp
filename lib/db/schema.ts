import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const players = pgTable("players", {
  waId: text("wa_id").primaryKey(),
  displayName: text("display_name"),
  weaknesses: text("weaknesses"),
  adviceHistory: text("advice_history"),
  lastGoal: text("last_goal"),
  improvementNotes: text("improvement_notes"),
  lastInteractionId: text("last_interaction_id"),
  /** SHA256 prefix of the Gemini API key used when `last_interaction_id` was valid; clears chain on key rotation. */
  geminiKeyFp: text("gemini_key_fp"),
  pendingPartnerPhone: text("pending_partner_phone"),
  pendingInviteCode: text("pending_invite_code"),
  updatedAt: timestamp("updated_at", { mode: "date" }),
});

export const pairs = pgTable("pairs", {
  duoId: text("duo_id").primaryKey(),
  waIdA: text("wa_id_a").notNull(),
  waIdB: text("wa_id_b").notNull(),
  groupWhatsappId: text("group_whatsapp_id"),
  status: text("status").notNull().default("active"),
  consentA: boolean("consent_a").notNull().default(true),
  consentB: boolean("consent_b").notNull().default(false),
  sessionPhase: text("session_phase").notNull().default("duo_pre"),
  createdAt: timestamp("created_at", { mode: "date" }),
});

export const sharedSessions = pgTable("shared_sessions", {
  id: text("id").primaryKey(),
  duoId: text("duo_id").notNull(),
  phase: text("phase").notNull(),
  notes: text("notes"),
  matchDate: text("match_date"),
  updatedAt: timestamp("updated_at", { mode: "date" }),
});

export const processedMessages = pgTable("processed_messages", {
  messageId: text("message_id").primaryKey(),
  processedAt: timestamp("processed_at", { mode: "date" }),
});

export type Player = typeof players.$inferSelect;
export type Pair = typeof pairs.$inferSelect;
