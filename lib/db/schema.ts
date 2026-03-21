import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const players = sqliteTable("players", {
  waId: text("wa_id").primaryKey(),
  displayName: text("display_name"),
  weaknesses: text("weaknesses"),
  adviceHistory: text("advice_history"),
  lastGoal: text("last_goal"),
  improvementNotes: text("improvement_notes"),
  lastInteractionId: text("last_interaction_id"),
  pendingPartnerPhone: text("pending_partner_phone"),
  pendingInviteCode: text("pending_invite_code"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
});

export const pairs = sqliteTable("pairs", {
  duoId: text("duo_id").primaryKey(),
  waIdA: text("wa_id_a").notNull(),
  waIdB: text("wa_id_b").notNull(),
  groupWhatsappId: text("group_whatsapp_id"),
  status: text("status").notNull().default("active"),
  consentA: integer("consent_a", { mode: "boolean" }).notNull().default(true),
  consentB: integer("consent_b", { mode: "boolean" }).notNull().default(false),
  sessionPhase: text("session_phase").notNull().default("duo_pre"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }),
});

export const sharedSessions = sqliteTable("shared_sessions", {
  id: text("id").primaryKey(),
  duoId: text("duo_id").notNull(),
  phase: text("phase").notNull(),
  notes: text("notes"),
  matchDate: text("match_date"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
});

export const processedMessages = sqliteTable("processed_messages", {
  messageId: text("message_id").primaryKey(),
  processedAt: integer("processed_at", { mode: "timestamp_ms" }),
});

export type Player = typeof players.$inferSelect;
export type Pair = typeof pairs.$inferSelect;
