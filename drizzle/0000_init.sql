CREATE TABLE `pairs` (
	`duo_id` text PRIMARY KEY NOT NULL,
	`wa_id_a` text NOT NULL,
	`wa_id_b` text NOT NULL,
	`group_whatsapp_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`consent_a` integer DEFAULT true NOT NULL,
	`consent_b` integer DEFAULT false NOT NULL,
	`session_phase` text DEFAULT 'duo_pre' NOT NULL,
	`created_at` integer
);
--> statement-breakpoint
CREATE TABLE `players` (
	`wa_id` text PRIMARY KEY NOT NULL,
	`display_name` text,
	`weaknesses` text,
	`advice_history` text,
	`last_goal` text,
	`improvement_notes` text,
	`last_interaction_id` text,
	`pending_partner_phone` text,
	`pending_invite_code` text,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `processed_messages` (
	`message_id` text PRIMARY KEY NOT NULL,
	`processed_at` integer
);
--> statement-breakpoint
CREATE TABLE `shared_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`duo_id` text NOT NULL,
	`phase` text NOT NULL,
	`notes` text,
	`match_date` text,
	`updated_at` integer
);
