-- Preview baseline, part 1 of 2: application tables in app_preview.
--
-- DERIVED FROM: backend/db/drizzle/0000_initial_schema.sql
-- The original is preserved verbatim and is NEVER executed against app_preview.
--
-- Two deliberate differences from the original, both required for isolation:
--   1. The schema is created here (this file runs first) and
--      `SET search_path = app_preview` pins every unqualified CREATE TABLE,
--      CREATE INDEX and ALTER TABLE to the Preview schema.
--   2. The 16 quoted FOREIGN KEY references are explicitly qualified as
--      "app_preview"."<table>". In the original they read "public"."<table>",
--      and an explicit quoted qualifier OVERRIDES search_path. Left as-is they
--      would either fail or, worse, silently attach Preview foreign keys to
--      another schema's tables.
--
-- Table names, column names, defaults, CHECK constraints, unique constraints,
-- indexes and foreign-key actions are otherwise byte-identical to 0000.

CREATE SCHEMA IF NOT EXISTS app_preview;
--> statement-breakpoint
SET search_path = app_preview;
--> statement-breakpoint
CREATE TABLE "account_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"token_hash" text NOT NULL,
	"target_email" text,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"email_send_count" integer DEFAULT 0 NOT NULL,
	"last_email_attempt_at" timestamp DEFAULT now() NOT NULL,
	"last_email_sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "account_tokens_user_purpose_key" UNIQUE("user_id","purpose"),
	CONSTRAINT "account_tokens_token_hash_key" UNIQUE("token_hash"),
	CONSTRAINT "account_tokens_purpose_check" CHECK ("account_tokens"."purpose" in ('password_reset', 'email_verification', 'email_change')),
	CONSTRAINT "account_tokens_token_hash_check" CHECK ("account_tokens"."token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "account_tokens_target_email_check" CHECK (("account_tokens"."purpose" = 'password_reset' and "account_tokens"."target_email" is null) or ("account_tokens"."purpose" in ('email_verification', 'email_change') and "account_tokens"."target_email" = lower(btrim("account_tokens"."target_email")) and "account_tokens"."target_email" ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
	CONSTRAINT "account_tokens_email_send_count_check" CHECK ("account_tokens"."email_send_count" between 0 and 5),
	CONSTRAINT "account_tokens_expires_after_creation_check" CHECK ("account_tokens"."expires_at" > "account_tokens"."created_at"),
	CONSTRAINT "account_tokens_used_after_creation_check" CHECK ("account_tokens"."used_at" is null or "account_tokens"."used_at" >= "account_tokens"."created_at")
);
--> statement-breakpoint
CREATE TABLE "admin_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" text NOT NULL,
	"outcome" text DEFAULT 'success' NOT NULL,
	"entity" text,
	"entity_id" uuid,
	"details" text,
	"ip_address" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admin_audit_logs_action_check" CHECK (char_length("admin_audit_logs"."action") between 1 and 100),
	CONSTRAINT "admin_audit_logs_outcome_check" CHECK ("admin_audit_logs"."outcome" in ('success', 'failure')),
	CONSTRAINT "admin_audit_logs_entity_check" CHECK ("admin_audit_logs"."entity" is null or char_length("admin_audit_logs"."entity") <= 60),
	CONSTRAINT "admin_audit_logs_details_check" CHECK ("admin_audit_logs"."details" is null or char_length("admin_audit_logs"."details") <= 1000),
	CONSTRAINT "admin_audit_logs_ip_address_check" CHECK ("admin_audit_logs"."ip_address" is null or char_length("admin_audit_logs"."ip_address") <= 120)
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	"creator_name" text NOT NULL,
	"creator_contact" text,
	"message" text,
	"quote_amount" integer,
	"proposed_timeline_days" integer,
	"proposed_timeline" text,
	"creator_profile_snapshot" jsonb,
	"snapshot_captured_at" timestamp,
	"status" text DEFAULT 'applied' NOT NULL,
	"decision_note" text,
	"decision_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "applications_campaign_user_unique" UNIQUE("campaign_id","user_id"),
	CONSTRAINT "applications_status_check" CHECK ("applications"."status" in ('applied', 'shortlisted', 'rejected', 'hired', 'completed', 'withdrawn')),
	CONSTRAINT "applications_quote_check" CHECK ("applications"."quote_amount" is null or "applications"."quote_amount" between 1 and 10000000),
	CONSTRAINT "applications_timeline_days_check" CHECK ("applications"."proposed_timeline_days" is null or "applications"."proposed_timeline_days" between 1 and 365),
	CONSTRAINT "applications_timeline_check" CHECK ("applications"."proposed_timeline" is null or char_length("applications"."proposed_timeline") between 1 and 300),
	CONSTRAINT "applications_snapshot_check" CHECK (("applications"."creator_profile_snapshot" is null and "applications"."snapshot_captured_at" is null) or ("applications"."creator_profile_snapshot" is not null and jsonb_typeof("applications"."creator_profile_snapshot") = 'object' and "applications"."snapshot_captured_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_type" text NOT NULL,
	"actor_user_id" uuid,
	"owner_user_id" uuid,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"changed_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "audit_events_actor_type_check" CHECK ("audit_events"."actor_type" in ('user', 'admin', 'system')),
	CONSTRAINT "audit_events_entity_type_check" CHECK ("audit_events"."entity_type" in ('user', 'brand', 'creator_profile', 'campaign', 'application', 'report', 'contact', 'setting')),
	CONSTRAINT "audit_events_action_check" CHECK (char_length("audit_events"."action") between 1 and 100),
	CONSTRAINT "audit_events_from_status_check" CHECK ("audit_events"."from_status" is null or char_length("audit_events"."from_status") <= 40),
	CONSTRAINT "audit_events_to_status_check" CHECK ("audit_events"."to_status" is null or char_length("audit_events"."to_status") <= 40),
	CONSTRAINT "audit_events_changed_fields_check" CHECK (jsonb_typeof("audit_events"."changed_fields") = 'array' and pg_column_size("audit_events"."changed_fields") <= 4096),
	CONSTRAINT "audit_events_metadata_check" CHECK (jsonb_typeof("audit_events"."metadata") = 'object' and pg_column_size("audit_events"."metadata") <= 4096)
);
--> statement-breakpoint
CREATE TABLE "auth_failure_lockouts" (
	"key_hash" text PRIMARY KEY NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"first_failed_at" timestamp DEFAULT now() NOT NULL,
	"last_failed_at" timestamp DEFAULT now() NOT NULL,
	"locked_until" timestamp,
	"expires_at" timestamp NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "auth_failure_lockouts_key_hash_check" CHECK ("auth_failure_lockouts"."key_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "auth_failure_lockouts_count_check" CHECK ("auth_failure_lockouts"."failure_count" between 0 and 1000000),
	CONSTRAINT "auth_failure_lockouts_age_check" CHECK ("auth_failure_lockouts"."last_failed_at" >= "auth_failure_lockouts"."first_failed_at" and "auth_failure_lockouts"."expires_at" > "auth_failure_lockouts"."last_failed_at"),
	CONSTRAINT "auth_failure_lockouts_locked_until_check" CHECK ("auth_failure_lockouts"."locked_until" is null or "auth_failure_lockouts"."locked_until" >= "auth_failure_lockouts"."first_failed_at")
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "brands_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "brands_status_check" CHECK ("brands"."status" = 'active'),
	CONSTRAINT "brands_email_canonical_check" CHECK ("brands"."email" is null or ("brands"."email" = lower(btrim("brands"."email")) and "brands"."email" ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'))
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"brand_id" uuid,
	"submission_id" uuid,
	"submission_fingerprint" text,
	"business_name" text NOT NULL,
	"contact_name" text,
	"email" text,
	"email_source" text DEFAULT 'campaign' NOT NULL,
	"phone" text,
	"phone_source" text DEFAULT 'campaign' NOT NULL,
	"title" text NOT NULL,
	"promotion_type" text DEFAULT 'Product' NOT NULL,
	"category" text,
	"description" text,
	"budget" integer DEFAULT 5000 NOT NULL,
	"location" text,
	"language" text DEFAULT 'English' NOT NULL,
	"target_audience" text,
	"format" text DEFAULT 'Story' NOT NULL,
	"website" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"verification_code" text,
	"verification_status" text DEFAULT 'unverified' NOT NULL,
	"moderation_note" text,
	"reviewed_at" timestamp,
	"deadline_at" timestamp,
	"expires_at" timestamp DEFAULT now() + interval '45 days' NOT NULL,
	"expired_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaigns_submission_pair_check" CHECK (("campaigns"."submission_id" is null and "campaigns"."submission_fingerprint" is null) or ("campaigns"."submission_id" is not null and "campaigns"."submission_fingerprint" ~ '^[0-9a-f]{64}$')),
	CONSTRAINT "campaigns_promotion_type_check" CHECK ("campaigns"."promotion_type" in ('Local Business', 'App', 'Website', 'Product', 'Creator / UGC', 'Event')),
	CONSTRAINT "campaigns_category_check" CHECK ("campaigns"."category" is null or "campaigns"."category" in ('Food & Cafe', 'Fashion & Lifestyle', 'Memes & Comedy', 'Education & Motivation', 'Tech & Apps', 'Travel & Local', 'Fitness & Health', 'Beauty & Skincare', 'Finance & Business', 'Music & Entertainment', 'Punjabi Culture', 'Other')),
	CONSTRAINT "campaigns_language_check" CHECK ("campaigns"."language" in ('English', 'Hindi', 'Punjabi', 'Hinglish', 'Bengali', 'Marathi', 'Tamil', 'Telugu')),
	CONSTRAINT "campaigns_format_check" CHECK ("campaigns"."format" in ('Story', 'Reel', 'Post', 'UGC Video', 'YouTube Shorts', 'YouTube Video')),
	CONSTRAINT "campaigns_email_source_check" CHECK ("campaigns"."email_source" in ('account', 'campaign')),
	CONSTRAINT "campaigns_phone_source_check" CHECK ("campaigns"."phone_source" in ('account', 'campaign')),
	CONSTRAINT "campaigns_status_check" CHECK ("campaigns"."status" in ('pending', 'open', 'paused', 'rejected', 'suspended', 'closed', 'expired')),
	CONSTRAINT "campaigns_expiry_check" CHECK ("campaigns"."expires_at" > "campaigns"."created_at" and ("campaigns"."deadline_at" is null or "campaigns"."deadline_at" = "campaigns"."expires_at") and ("campaigns"."expired_at" is null or "campaigns"."expired_at" >= "campaigns"."expires_at")),
	CONSTRAINT "campaigns_verification_status_check" CHECK ("campaigns"."verification_status" in ('unverified', 'pending', 'verified', 'failed')),
	CONSTRAINT "campaigns_budget_check" CHECK ("campaigns"."budget" between 500 and 10000000),
	CONSTRAINT "campaigns_email_canonical_check" CHECK ("campaigns"."email" is null or ("campaigns"."email" = lower(btrim("campaigns"."email")) and "campaigns"."email" ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'))
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"kind" text DEFAULT 'brand' NOT NULL,
	"message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "contacts_kind_check" CHECK ("contacts"."kind" in ('brand', 'creator', 'other')),
	CONSTRAINT "contacts_email_canonical_check" CHECK ("contacts"."email" is null or ("contacts"."email" = lower(btrim("contacts"."email")) and "contacts"."email" ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'))
);
--> statement-breakpoint
CREATE TABLE "creators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"email_source" text DEFAULT 'profile' NOT NULL,
	"phone" text,
	"phone_source" text DEFAULT 'profile' NOT NULL,
	"instagram" text,
	"youtube" text,
	"profile_url" text,
	"platform" text DEFAULT 'Instagram' NOT NULL,
	"followers" integer DEFAULT 0 NOT NULL,
	"category" text,
	"languages" text DEFAULT 'English' NOT NULL,
	"location" text,
	"content_types" text DEFAULT 'Story' NOT NULL,
	"bio" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"verification_code" text,
	"verification_status" text DEFAULT 'unverified' NOT NULL,
	"verified_followers" integer,
	"moderation_note" text,
	"reviewed_at" timestamp,
	"listed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "creators_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "creators_id_user_id_key" UNIQUE("id","user_id"),
	CONSTRAINT "creators_email_source_check" CHECK ("creators"."email_source" in ('account', 'profile')),
	CONSTRAINT "creators_phone_source_check" CHECK ("creators"."phone_source" in ('account', 'profile')),
	CONSTRAINT "creators_platform_check" CHECK ("creators"."platform" in ('Instagram', 'YouTube', 'Both', 'Other')),
	CONSTRAINT "creators_category_check" CHECK ("creators"."category" is null or "creators"."category" in ('Food & Cafe', 'Fashion & Lifestyle', 'Memes & Comedy', 'Education & Motivation', 'Tech & Apps', 'Travel & Local', 'Fitness & Health', 'Beauty & Skincare', 'Finance & Business', 'Music & Entertainment', 'Punjabi Culture', 'Other')),
	CONSTRAINT "creators_languages_check" CHECK ("creators"."languages" ~ '^(English|Hindi|Punjabi|Hinglish|Bengali|Marathi|Tamil|Telugu)(, (English|Hindi|Punjabi|Hinglish|Bengali|Marathi|Tamil|Telugu))*$'),
	CONSTRAINT "creators_content_types_check" CHECK ("creators"."content_types" ~ '^(Story|Reel|Post|UGC Video|YouTube Shorts|YouTube Video)(, (Story|Reel|Post|UGC Video|YouTube Shorts|YouTube Video))*$'),
	CONSTRAINT "creators_status_check" CHECK ("creators"."status" in ('incomplete', 'pending', 'approved', 'rejected', 'suspended')),
	CONSTRAINT "creators_verification_status_check" CHECK ("creators"."verification_status" in ('unverified', 'pending', 'verified', 'failed')),
	CONSTRAINT "creators_followers_check" CHECK ("creators"."followers" between 0 and 100000000),
	CONSTRAINT "creators_verified_followers_check" CHECK ("creators"."verified_followers" is null or ("creators"."verified_followers" between 0 and 100000000)),
	CONSTRAINT "creators_email_canonical_check" CHECK ("creators"."email" is null or ("creators"."email" = lower(btrim("creators"."email")) and "creators"."email" ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'))
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"campaign_id" uuid,
	"application_id" uuid,
	"campaign_title" text NOT NULL,
	"actor_name" text,
	"application_status" text,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_kind_check" CHECK ("notifications"."kind" in ('application_received', 'application_withdrawn', 'application_status')),
	CONSTRAINT "notifications_application_status_check" CHECK ("notifications"."application_status" is null or "notifications"."application_status" in ('applied', 'shortlisted', 'rejected', 'hired', 'completed', 'withdrawn')),
	CONSTRAINT "notifications_campaign_title_check" CHECK (char_length("notifications"."campaign_title") between 1 and 160),
	CONSTRAINT "notifications_actor_name_check" CHECK ("notifications"."actor_name" is null or char_length("notifications"."actor_name") <= 120)
);
--> statement-breakpoint
CREATE TABLE "pending_signups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"role" text DEFAULT 'brand' NOT NULL,
	"password_hash" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"verification_attempts" integer DEFAULT 0 NOT NULL,
	"email_send_count" integer DEFAULT 0 NOT NULL,
	"last_email_attempt_at" timestamp DEFAULT now() NOT NULL,
	"last_email_sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pending_signups_email_key" UNIQUE("email"),
	CONSTRAINT "pending_signups_token_hash_key" UNIQUE("token_hash"),
	CONSTRAINT "pending_signups_role_check" CHECK ("pending_signups"."role" in ('brand', 'creator')),
	CONSTRAINT "pending_signups_email_canonical_check" CHECK ("pending_signups"."email" = lower(btrim("pending_signups"."email")) and "pending_signups"."email" ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
	CONSTRAINT "pending_signups_token_hash_check" CHECK ("pending_signups"."token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "pending_signups_verification_attempts_check" CHECK ("pending_signups"."verification_attempts" between 0 and 5),
	CONSTRAINT "pending_signups_email_send_count_check" CHECK ("pending_signups"."email_send_count" between 0 and 5),
	CONSTRAINT "pending_signups_expires_after_creation_check" CHECK ("pending_signups"."expires_at" > "pending_signups"."created_at")
);
--> statement-breakpoint
CREATE TABLE "rate_limit_buckets" (
	"key_hash" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"window_started_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rate_limit_buckets_key_hash_check" CHECK ("rate_limit_buckets"."key_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "rate_limit_buckets_count_check" CHECK ("rate_limit_buckets"."count" between 0 and 1000000),
	CONSTRAINT "rate_limit_buckets_window_check" CHECK ("rate_limit_buckets"."expires_at" > "rate_limit_buckets"."window_started_at")
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"reporter_user_id" uuid,
	"reporter_name" text,
	"reporter_contact" text,
	"reason" text NOT NULL,
	"details" text,
	"status" text DEFAULT 'open' NOT NULL,
	"admin_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp,
	CONSTRAINT "reports_target_type_check" CHECK ("reports"."target_type" in ('campaign', 'creator')),
	CONSTRAINT "reports_reason_check" CHECK ("reports"."reason" in ('impersonation', 'scam', 'spam', 'incorrect-info', 'other')),
	CONSTRAINT "reports_status_check" CHECK ("reports"."status" in ('open', 'resolved', 'dismissed'))
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_version" integer NOT NULL,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	CONSTRAINT "user_sessions_token_version_check" CHECK ("user_sessions"."token_version" >= 0),
	CONSTRAINT "user_sessions_user_agent_check" CHECK ("user_sessions"."user_agent" is null or char_length("user_sessions"."user_agent") <= 500),
	CONSTRAINT "user_sessions_expires_after_creation_check" CHECK ("user_sessions"."expires_at" > "user_sessions"."created_at"),
	CONSTRAINT "user_sessions_last_seen_check" CHECK ("user_sessions"."last_seen_at" >= "user_sessions"."created_at"),
	CONSTRAINT "user_sessions_revoked_check" CHECK ("user_sessions"."revoked_at" is null or "user_sessions"."revoked_at" >= "user_sessions"."created_at")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"role" text DEFAULT 'brand' NOT NULL,
	"password_hash" text NOT NULL,
	"email_verified_at" timestamp,
	"token_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_role_check" CHECK ("users"."role" in ('brand', 'creator')),
	CONSTRAINT "users_email_canonical_check" CHECK ("users"."email" = lower(btrim("users"."email")) and "users"."email" ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
);
--> statement-breakpoint
ALTER TABLE "account_tokens" ADD CONSTRAINT "account_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app_preview"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "app_preview"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app_preview"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "app_preview"."creators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_creator_user_fkey" FOREIGN KEY ("creator_id","user_id") REFERENCES "app_preview"."creators"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "app_preview"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "app_preview"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app_preview"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "app_preview"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "app_preview"."brands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creators" ADD CONSTRAINT "creators_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app_preview"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app_preview"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "app_preview"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "app_preview"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "app_preview"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app_preview"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_tokens_expires_at_idx" ON "account_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "account_tokens_target_email_idx" ON "account_tokens" USING btree ("target_email");--> statement-breakpoint
CREATE INDEX "admin_audit_logs_created_at_idx" ON "admin_audit_logs" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "admin_audit_logs_action_created_at_idx" ON "admin_audit_logs" USING btree ("action","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "admin_audit_logs_entity_idx" ON "admin_audit_logs" USING btree ("entity","entity_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "applications_campaign_created_idx" ON "applications" USING btree ("campaign_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "applications_user_created_idx" ON "applications" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "applications_creator_created_idx" ON "applications" USING btree ("creator_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "applications_campaign_contact_idx" ON "applications" USING btree ("campaign_id","creator_contact");--> statement-breakpoint
CREATE INDEX "applications_campaign_status_created_idx" ON "applications" USING btree ("campaign_id","status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "applications_user_status_created_idx" ON "applications" USING btree ("user_id","status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "applications_created_at_idx" ON "applications" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_events_entity_created_idx" ON "audit_events" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_created_idx" ON "audit_events" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_events_actor_created_idx" ON "audit_events" USING btree ("actor_user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_events_owner_created_idx" ON "audit_events" USING btree ("owner_user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_events_action_created_idx" ON "audit_events" USING btree ("action","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "auth_failure_lockouts_expires_at_idx" ON "auth_failure_lockouts" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "auth_failure_lockouts_locked_until_idx" ON "auth_failure_lockouts" USING btree ("locked_until");--> statement-breakpoint
CREATE UNIQUE INDEX "campaigns_owner_submission_unique" ON "campaigns" USING btree ("owner_id","submission_id");--> statement-breakpoint
CREATE INDEX "campaigns_public_review_idx" ON "campaigns" USING btree ("status","verification_status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "campaigns_public_expiry_idx" ON "campaigns" USING btree ("status","verification_status","expires_at");--> statement-breakpoint
CREATE INDEX "campaigns_status_expires_idx" ON "campaigns" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "campaigns_brand_created_idx" ON "campaigns" USING btree ("brand_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "campaigns_owner_created_idx" ON "campaigns" USING btree ("owner_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "campaigns_created_at_idx" ON "campaigns" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "contacts_created_at_idx" ON "contacts" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "creators_public_review_idx" ON "creators" USING btree ("status","verification_status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "creators_public_listed_idx" ON "creators" USING btree ("status","verification_status","listed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "creators_created_at_idx" ON "creators" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notifications_user_read_created_idx" ON "notifications" USING btree ("user_id","read_at","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "pending_signups_email_lower_key" ON "pending_signups" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "pending_signups_expires_at_idx" ON "pending_signups" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "rate_limit_buckets_expires_at_idx" ON "rate_limit_buckets" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "reports_target_status_idx" ON "reports" USING btree ("target_type","target_id","status");--> statement-breakpoint
CREATE INDEX "reports_status_created_idx" ON "reports" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "reports_reporter_user_idx" ON "reports" USING btree ("reporter_user_id");--> statement-breakpoint
CREATE INDEX "user_sessions_user_last_seen_idx" ON "user_sessions" USING btree ("user_id","last_seen_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "user_sessions_user_active_idx" ON "user_sessions" USING btree ("user_id","revoked_at","expires_at");--> statement-breakpoint
CREATE INDEX "user_sessions_expires_at_idx" ON "user_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_key" ON "users" USING btree (lower("email"));