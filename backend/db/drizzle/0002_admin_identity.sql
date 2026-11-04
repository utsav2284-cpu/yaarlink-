CREATE TABLE "admin_auth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"revoked_at" timestamp,
	"email_send_count" integer DEFAULT 0 NOT NULL,
	"last_email_attempt_at" timestamp DEFAULT now() NOT NULL,
	"last_email_sent_at" timestamp,
	"created_by_admin_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admin_auth_tokens_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "admin_auth_tokens_purpose_check" CHECK ("admin_auth_tokens"."purpose" in ('owner_setup', 'admin_invitation', 'password_reset')),
	CONSTRAINT "admin_auth_tokens_token_hash_check" CHECK ("admin_auth_tokens"."token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "admin_auth_tokens_email_send_count_check" CHECK ("admin_auth_tokens"."email_send_count" between 0 and 5),
	CONSTRAINT "admin_auth_tokens_expires_after_creation_check" CHECK ("admin_auth_tokens"."expires_at" > "admin_auth_tokens"."created_at"),
	CONSTRAINT "admin_auth_tokens_used_check" CHECK ("admin_auth_tokens"."used_at" is null or "admin_auth_tokens"."used_at" >= "admin_auth_tokens"."created_at"),
	CONSTRAINT "admin_auth_tokens_revoked_check" CHECK ("admin_auth_tokens"."revoked_at" is null or "admin_auth_tokens"."revoked_at" >= "admin_auth_tokens"."created_at")
);
--> statement-breakpoint
CREATE TABLE "admin_passkeys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"credential_id" text NOT NULL,
	"public_key" text NOT NULL,
	"counter" integer DEFAULT 0 NOT NULL,
	"transports" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"device_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp,
	CONSTRAINT "admin_passkeys_credential_id_unique" UNIQUE("credential_id"),
	CONSTRAINT "admin_passkeys_credential_id_check" CHECK ("admin_passkeys"."credential_id" ~ '^[A-Za-z0-9_-]{1,512}$'),
	CONSTRAINT "admin_passkeys_public_key_check" CHECK ("admin_passkeys"."public_key" ~ '^[A-Za-z0-9_-]{1,8192}$'),
	CONSTRAINT "admin_passkeys_counter_check" CHECK ("admin_passkeys"."counter" >= 0),
	CONSTRAINT "admin_passkeys_transports_check" CHECK (jsonb_typeof("admin_passkeys"."transports") = 'array' and pg_column_size("admin_passkeys"."transports") <= 1024),
	CONSTRAINT "admin_passkeys_device_name_check" CHECK ("admin_passkeys"."device_name" is null or char_length("admin_passkeys"."device_name") <= 120),
	CONSTRAINT "admin_passkeys_last_used_check" CHECK ("admin_passkeys"."last_used_at" is null or "admin_passkeys"."last_used_at" >= "admin_passkeys"."created_at")
);
--> statement-breakpoint
CREATE TABLE "admin_recovery_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admin_recovery_codes_code_hash_unique" UNIQUE("code_hash"),
	CONSTRAINT "admin_recovery_codes_hash_check" CHECK ("admin_recovery_codes"."code_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "admin_recovery_codes_used_check" CHECK ("admin_recovery_codes"."used_at" is null or "admin_recovery_codes"."used_at" >= "admin_recovery_codes"."created_at")
);
--> statement-breakpoint
CREATE TABLE "admin_security_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid,
	"actor_admin_id" uuid,
	"event_type" text NOT NULL,
	"outcome" text DEFAULT 'success' NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admin_security_events_type_check" CHECK (char_length("admin_security_events"."event_type") between 1 and 100),
	CONSTRAINT "admin_security_events_outcome_check" CHECK ("admin_security_events"."outcome" in ('success', 'failure')),
	CONSTRAINT "admin_security_events_ip_address_check" CHECK ("admin_security_events"."ip_address" is null or char_length("admin_security_events"."ip_address") <= 120),
	CONSTRAINT "admin_security_events_user_agent_check" CHECK ("admin_security_events"."user_agent" is null or char_length("admin_security_events"."user_agent") <= 500),
	CONSTRAINT "admin_security_events_metadata_check" CHECK (jsonb_typeof("admin_security_events"."metadata") = 'object' and pg_column_size("admin_security_events"."metadata") <= 4096)
);
--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"token_version" integer NOT NULL,
	"user_agent" text,
	"ip_address" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	CONSTRAINT "admin_sessions_token_version_check" CHECK ("admin_sessions"."token_version" >= 0),
	CONSTRAINT "admin_sessions_user_agent_check" CHECK ("admin_sessions"."user_agent" is null or char_length("admin_sessions"."user_agent") <= 500),
	CONSTRAINT "admin_sessions_ip_address_check" CHECK ("admin_sessions"."ip_address" is null or char_length("admin_sessions"."ip_address") <= 120),
	CONSTRAINT "admin_sessions_expires_after_creation_check" CHECK ("admin_sessions"."expires_at" > "admin_sessions"."created_at"),
	CONSTRAINT "admin_sessions_last_seen_check" CHECK ("admin_sessions"."last_seen_at" >= "admin_sessions"."created_at"),
	CONSTRAINT "admin_sessions_revoked_check" CHECK ("admin_sessions"."revoked_at" is null or "admin_sessions"."revoked_at" >= "admin_sessions"."created_at")
);
--> statement-breakpoint
CREATE TABLE "admin_totp_credentials" (
	"admin_user_id" uuid PRIMARY KEY NOT NULL,
	"secret_ciphertext" text NOT NULL,
	"secret_iv" text NOT NULL,
	"verified_at" timestamp,
	"last_counter" integer DEFAULT -1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admin_totp_credentials_ciphertext_check" CHECK (char_length("admin_totp_credentials"."secret_ciphertext") between 1 and 1000),
	CONSTRAINT "admin_totp_credentials_iv_check" CHECK ("admin_totp_credentials"."secret_iv" ~ '^[A-Za-z0-9_-]{1,64}$'),
	CONSTRAINT "admin_totp_credentials_counter_check" CHECK ("admin_totp_credentials"."last_counter" >= -1),
	CONSTRAINT "admin_totp_credentials_verified_check" CHECK ("admin_totp_credentials"."verified_at" is null or "admin_totp_credentials"."verified_at" >= "admin_totp_credentials"."created_at")
);
--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"password_hash" text,
	"role" text NOT NULL,
	"status" text DEFAULT 'invited' NOT NULL,
	"email_verified_at" timestamp,
	"password_changed_at" timestamp,
	"last_login_at" timestamp,
	"token_version" integer DEFAULT 0 NOT NULL,
	"created_by_admin_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admin_users_email_unique" UNIQUE("email"),
	CONSTRAINT "admin_users_role_check" CHECK ("admin_users"."role" in ('super_admin', 'admin', 'operations_manager', 'verification_manager', 'support_manager', 'finance_manager', 'content_manager', 'analyst')),
	CONSTRAINT "admin_users_status_check" CHECK ("admin_users"."status" in ('invited', 'active', 'suspended', 'revoked')),
	CONSTRAINT "admin_users_email_canonical_check" CHECK ("admin_users"."email" = lower(btrim("admin_users"."email")) and "admin_users"."email" ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
	CONSTRAINT "admin_users_name_check" CHECK ("admin_users"."name" is null or char_length(btrim("admin_users"."name")) between 1 and 120),
	CONSTRAINT "admin_users_activation_check" CHECK (("admin_users"."status" = 'invited' and "admin_users"."password_hash" is null) or ("admin_users"."status" <> 'invited' and "admin_users"."password_hash" is not null and "admin_users"."name" is not null and "admin_users"."email_verified_at" is not null)),
	CONSTRAINT "admin_users_token_version_check" CHECK ("admin_users"."token_version" >= 0)
);
--> statement-breakpoint
ALTER TABLE "admin_audit_logs" ADD COLUMN "actor_admin_id" uuid;--> statement-breakpoint
ALTER TABLE "admin_auth_tokens" ADD CONSTRAINT "admin_auth_tokens_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_auth_tokens" ADD CONSTRAINT "admin_auth_tokens_created_by_admin_id_admin_users_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_passkeys" ADD CONSTRAINT "admin_passkeys_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_recovery_codes" ADD CONSTRAINT "admin_recovery_codes_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_totp_credentials" ADD CONSTRAINT "admin_totp_credentials_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_created_by_admin_id_admin_users_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_auth_tokens_admin_purpose_idx" ON "admin_auth_tokens" USING btree ("admin_user_id","purpose","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "admin_auth_tokens_expires_at_idx" ON "admin_auth_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "admin_passkeys_admin_created_idx" ON "admin_passkeys" USING btree ("admin_user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "admin_recovery_codes_admin_unused_idx" ON "admin_recovery_codes" USING btree ("admin_user_id","used_at","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "admin_security_events_admin_created_idx" ON "admin_security_events" USING btree ("admin_user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "admin_security_events_actor_created_idx" ON "admin_security_events" USING btree ("actor_admin_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "admin_security_events_type_created_idx" ON "admin_security_events" USING btree ("event_type","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "admin_security_events_created_idx" ON "admin_security_events" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "admin_sessions_admin_last_seen_idx" ON "admin_sessions" USING btree ("admin_user_id","last_seen_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "admin_sessions_admin_active_idx" ON "admin_sessions" USING btree ("admin_user_id","revoked_at","expires_at");--> statement-breakpoint
CREATE INDEX "admin_sessions_expires_at_idx" ON "admin_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_users_email_lower_key" ON "admin_users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "admin_users_role_status_idx" ON "admin_users" USING btree ("role","status");--> statement-breakpoint
CREATE INDEX "admin_users_created_at_idx" ON "admin_users" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "admin_audit_logs_actor_created_at_idx" ON "admin_audit_logs" USING btree ("actor_admin_id","created_at" DESC NULLS LAST);--> statement-breakpoint
-- Runtime-role access for the administrator-identity tables. The security
-- event history is append-only; all other identity tables need ordinary CRUD
-- for token/session lifecycle operations.
REVOKE ALL ON TABLE public.admin_users, public.admin_auth_tokens, public.admin_sessions, public.admin_totp_credentials, public.admin_recovery_codes, public.admin_passkeys, public.admin_security_events FROM PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.admin_users, public.admin_auth_tokens, public.admin_sessions, public.admin_totp_credentials, public.admin_recovery_codes, public.admin_passkeys, public.admin_security_events FROM anon';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.admin_users, public.admin_auth_tokens, public.admin_sessions, public.admin_totp_credentials, public.admin_recovery_codes, public.admin_passkeys, public.admin_security_events FROM authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'yaarlink_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admin_users, public.admin_auth_tokens, public.admin_sessions, public.admin_totp_credentials, public.admin_recovery_codes, public.admin_passkeys TO yaarlink_app';
    EXECUTE 'REVOKE UPDATE, DELETE ON TABLE public.admin_security_events FROM yaarlink_app';
    EXECUTE 'GRANT SELECT, INSERT ON TABLE public.admin_security_events TO yaarlink_app';
  END IF;
END
$$;
--> statement-breakpoint
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.admin_auth_tokens ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.admin_totp_credentials ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.admin_recovery_codes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.admin_passkeys ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.admin_security_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
DECLARE
  app_table text;
  audit_command text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'yaarlink_app') THEN
    FOREACH app_table IN ARRAY ARRAY[
      'admin_users',
      'admin_auth_tokens',
      'admin_sessions',
      'admin_totp_credentials',
      'admin_recovery_codes',
      'admin_passkeys'
    ] LOOP
      EXECUTE format('DROP POLICY IF EXISTS yaarlink_app_all ON public.%I', app_table);
      EXECUTE format(
        'CREATE POLICY yaarlink_app_all ON public.%I AS PERMISSIVE FOR ALL TO yaarlink_app USING (true) WITH CHECK (true)',
        app_table
      );
    END LOOP;

    FOREACH audit_command IN ARRAY ARRAY['SELECT', 'INSERT'] LOOP
      EXECUTE format(
        'DROP POLICY IF EXISTS %I ON public.admin_security_events',
        'yaarlink_app_' || lower(audit_command)
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.admin_security_events AS PERMISSIVE FOR %s TO yaarlink_app %s',
        'yaarlink_app_' || lower(audit_command),
        audit_command,
        CASE audit_command
          WHEN 'SELECT' THEN 'USING (true)'
          ELSE 'WITH CHECK (true)'
        END
      );
    END LOOP;
  END IF;
END
$$;
