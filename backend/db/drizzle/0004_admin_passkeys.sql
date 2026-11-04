CREATE TABLE "admin_webauthn_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"challenge_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admin_webauthn_challenges_challenge_hash_unique" UNIQUE("challenge_hash"),
	CONSTRAINT "admin_webauthn_challenges_purpose_check" CHECK ("admin_webauthn_challenges"."purpose" in ('passkey_registration', 'passkey_authentication')),
	CONSTRAINT "admin_webauthn_challenges_hash_check" CHECK ("admin_webauthn_challenges"."challenge_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "admin_webauthn_challenges_expiry_check" CHECK ("admin_webauthn_challenges"."expires_at" > "admin_webauthn_challenges"."created_at"),
	CONSTRAINT "admin_webauthn_challenges_terminal_check" CHECK (("admin_webauthn_challenges"."used_at" is null or "admin_webauthn_challenges"."used_at" >= "admin_webauthn_challenges"."created_at") and ("admin_webauthn_challenges"."revoked_at" is null or "admin_webauthn_challenges"."revoked_at" >= "admin_webauthn_challenges"."created_at") and not ("admin_webauthn_challenges"."used_at" is not null and "admin_webauthn_challenges"."revoked_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "admin_passkeys" ALTER COLUMN "counter" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "admin_webauthn_challenges" ADD CONSTRAINT "admin_webauthn_challenges_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_webauthn_challenges" ADD CONSTRAINT "admin_webauthn_challenges_session_id_admin_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."admin_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_webauthn_challenges_admin_purpose_created_idx" ON "admin_webauthn_challenges" USING btree ("admin_user_id","session_id","purpose","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "admin_webauthn_challenges_expires_at_idx" ON "admin_webauthn_challenges" USING btree ("expires_at");--> statement-breakpoint
-- Runtime-role access for one-time WebAuthn ceremony state. Browser and
-- anonymous database roles must never read or mutate challenge rows.
REVOKE ALL ON TABLE public.admin_webauthn_challenges FROM PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.admin_webauthn_challenges FROM anon';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.admin_webauthn_challenges FROM authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'yaarlink_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admin_webauthn_challenges TO yaarlink_app';
  END IF;
END
$$;
--> statement-breakpoint
ALTER TABLE public.admin_webauthn_challenges ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'yaarlink_app') THEN
    DROP POLICY IF EXISTS yaarlink_app_all ON public.admin_webauthn_challenges;
    CREATE POLICY yaarlink_app_all ON public.admin_webauthn_challenges
      AS PERMISSIVE FOR ALL TO yaarlink_app USING (true) WITH CHECK (true);
  END IF;
END
$$;
--> statement-breakpoint
-- PostgreSQL regex repetition counts are capped at 255. Replace the earlier
-- {1,512}/{1,8192} expressions, which fail when a Passkey row is inserted,
-- with equivalent character-length plus character-set checks.
ALTER TABLE "admin_passkeys" DROP CONSTRAINT "admin_passkeys_credential_id_check";--> statement-breakpoint
ALTER TABLE "admin_passkeys" DROP CONSTRAINT "admin_passkeys_public_key_check";--> statement-breakpoint
ALTER TABLE "admin_passkeys" ADD CONSTRAINT "admin_passkeys_credential_id_check" CHECK (char_length("admin_passkeys"."credential_id") between 1 and 512 and "admin_passkeys"."credential_id" ~ '^[A-Za-z0-9_-]+$');--> statement-breakpoint
ALTER TABLE "admin_passkeys" ADD CONSTRAINT "admin_passkeys_public_key_check" CHECK (char_length("admin_passkeys"."public_key") between 1 and 8192 and "admin_passkeys"."public_key" ~ '^[A-Za-z0-9_-]+$');