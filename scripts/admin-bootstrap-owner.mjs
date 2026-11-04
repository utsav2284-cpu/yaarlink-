import { createHash, randomBytes } from "node:crypto";
import pg from "pg";

const { Pool } = pg;

function argumentValue(name) {
  const prefix = `${name}=`;
  const found = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : "";
}

function normalizeEmail(value) {
  const email = String(value ?? "").trim().toLowerCase();
  if (!email || email.length > 254 || /[\s\u0000-\u001f\u007f]/.test(email)) return null;
  const parts = email.split("@");
  if (parts.length !== 2) return null;
  const [local, domain] = parts;
  if (!local || local.length > 64 || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return null;
  if (!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)) return null;
  const labels = domain.split(".");
  if (labels.length < 2 || labels.some((label) => !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label))) return null;
  if (!/^[A-Za-z]{2,63}$/.test(labels[labels.length - 1])) return null;
  return email;
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

const email = normalizeEmail(argumentValue("--email") || process.env.ADMIN_OWNER_EMAIL);
if (!email) {
  throw new Error("Pass --email=owner@example.com or set ADMIN_OWNER_EMAIL. Never pass a password to this command.");
}

const resend = process.argv.includes("--resend");
const confirmedRemote = process.argv.includes("--yes");
const connectionString =
  process.env.ADMIN_BOOTSTRAP_DATABASE_URL || process.env.BOOTSTRAP_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("Set ADMIN_BOOTSTRAP_DATABASE_URL, BOOTSTRAP_DATABASE_URL, or DATABASE_URL in the private env file used to run this command.");
}

const databaseUrl = new URL(connectionString);
const databaseHost = databaseUrl.hostname;
const isLoopback = databaseHost === "localhost" || databaseHost === "127.0.0.1" || databaseHost === "::1";
if (!isLoopback && !confirmedRemote) {
  throw new Error(
    `Refusing to start owner setup against remote database host ${databaseHost} without --yes. Verify backup/recovery first, then rerun only with explicit production approval.`,
  );
}

const appUrl = new URL(requiredEnv("APP_URL"));
if (appUrl.protocol !== "https:" && !(isLoopback && appUrl.protocol === "http:")) {
  throw new Error("APP_URL must use HTTPS outside local loopback development.");
}

const resendApiKey = requiredEnv("RESEND_API_KEY");
const emailFrom = requiredEnv("EMAIL_FROM");
if (!emailFrom.includes("@")) throw new Error("EMAIL_FROM must contain an email address.");
const emailBaseUrl = (process.env.RESEND_API_BASE_URL?.trim() || "https://api.resend.com").replace(/\/+$/, "");

const pool = new Pool({
  connectionString,
  max: 1,
  ...(process.env.DATABASE_CA_CERT
    ? { ssl: { ca: process.env.DATABASE_CA_CERT, rejectUnauthorized: true } }
    : {}),
});

let tokenId;
let setupUrl;

try {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const tableCheck = await client.query(
      "SELECT to_regclass('public.admin_users') AS users_table, to_regclass('public.admin_auth_tokens') AS tokens_table, to_regclass('public.admin_security_events') AS events_table",
    );
    const tables = tableCheck.rows[0] ?? {};
    if (!tables.users_table || !tables.tokens_table || !tables.events_table) {
      throw new Error("Administrator identity tables do not exist in this database. Apply the reviewed migration first; do not run the empty-database bootstrap against an existing database.");
    }

    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('admin-owner-setup', 0))");

    const existing = await client.query(
      "SELECT id, email, role, status FROM admin_users WHERE status <> 'revoked' ORDER BY created_at FOR UPDATE",
    );
    const completed = existing.rows.find((row) => row.status === "active" || row.status === "suspended");
    if (completed) throw new Error("Administrator setup is already complete. This command will not create another owner.");

    let admin = null;
    if (existing.rowCount > 0) {
      const pending = existing.rows.length === 1 ? existing.rows[0] : null;
      if (!pending || pending.status !== "invited" || pending.role !== "super_admin") {
        throw new Error("Administrator setup is in an unexpected pending state. Inspect admin_users before continuing.");
      }
      if (pending.email !== email) {
        throw new Error("A different owner setup is already pending. Refusing to replace it from this command.");
      }
      if (!resend) {
        throw new Error("Owner setup is already pending for this email. Rerun with --resend to revoke the old link and send a new one.");
      }
      admin = pending;
    } else {
      const inserted = await client.query(
        `INSERT INTO admin_users (email, name, password_hash, role, status)
         VALUES ($1, NULL, NULL, 'super_admin', 'invited')
         RETURNING id, email, role, status`,
        [email],
      );
      admin = inserted.rows[0];
    }

    const now = new Date();
    const tokens = await client.query(
      `SELECT email_send_count, last_email_attempt_at, expires_at, used_at, revoked_at
         FROM admin_auth_tokens
        WHERE admin_user_id = $1 AND purpose = 'owner_setup'
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE`,
      [admin.id],
    );
    const latest = tokens.rows[0] ?? null;
    const latestActive = Boolean(
      latest && !latest.used_at && !latest.revoked_at && new Date(latest.expires_at).getTime() > now.getTime(),
    );
    if (latestActive) {
      const attemptAgeMs = now.getTime() - new Date(latest.last_email_attempt_at).getTime();
      if (attemptAgeMs < 60_000) throw new Error("A setup email was requested less than one minute ago. Wait before resending.");
      if (Number(latest.email_send_count) >= 5) throw new Error("The setup-email send limit for this pending link has been reached. Wait for it to expire before requesting another.");
    }

    await client.query(
      `UPDATE admin_auth_tokens
          SET revoked_at = $2, updated_at = $2
        WHERE admin_user_id = $1 AND purpose = 'owner_setup' AND used_at IS NULL AND revoked_at IS NULL`,
      [admin.id, now],
    );

    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(`yl_admin_token:owner_setup:${token}`).digest("hex");
    const expiresAt = new Date(now.getTime() + 20 * 60_000);
    const saved = await client.query(
      `INSERT INTO admin_auth_tokens (
         admin_user_id, purpose, token_hash, expires_at, email_send_count,
         last_email_attempt_at, last_email_sent_at, created_at, updated_at
       ) VALUES ($1, 'owner_setup', $2, $3, $4, $5, NULL, $5, $5)
       RETURNING id`,
      [admin.id, tokenHash, expiresAt, latestActive ? Number(latest.email_send_count) + 1 : 1, now],
    );
    tokenId = saved.rows[0]?.id;

    await client.query(
      `INSERT INTO admin_security_events (admin_user_id, actor_admin_id, event_type, outcome, metadata)
       VALUES ($1, NULL, 'admin.owner_setup_requested', 'success', $2::jsonb)`,
      [admin.id, JSON.stringify({ method: "operator_cli", resend })],
    );

    setupUrl = new URL("/admin/setup", appUrl.origin);
    setupUrl.hash = new URLSearchParams({ token, kind: "owner_setup" }).toString();

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  const safeUrl = escapeHtml(setupUrl.toString());
  const response = await fetch(`${emailBaseUrl}/emails`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: emailFrom,
      to: [email],
      subject: "Set up your YaarLink Super Admin account",
      text: [
        "Hi YaarLink owner,",
        "",
        "Use this restricted one-time link to create the first YaarLink Super Admin account and choose your own password:",
        setupUrl.toString(),
        "",
        "This one-time link expires in 20 minutes and works only for this email address.",
        "If you did not request administrator setup, ignore this email and contact YaarLink through a trusted channel.",
      ].join("\n"),
      html: `<div style="font-family:Arial,sans-serif;color:#1c1917;line-height:1.5;max-width:560px;margin:0 auto;padding:24px">
        <h1 style="font-size:24px;margin:0 0 16px">Set up Super Admin access</h1>
        <p>Use this restricted one-time link to create the first YaarLink Super Admin account and choose your own password.</p>
        <p style="margin:24px 0"><a href="${safeUrl}" style="background:#e4572e;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px;display:inline-block">Create Super Admin account</a></p>
        <p>This one-time link expires in 20 minutes and works only for this email address.</p>
        <p style="word-break:break-all"><a href="${safeUrl}">${safeUrl}</a></p>
        <p style="color:#57534e">If you did not request administrator setup, ignore this email and contact YaarLink through a trusted channel.</p>
      </div>`,
    }),
    signal: AbortSignal.timeout(8_000),
  });

  if (!response.ok) {
    throw new Error(`Email provider returned HTTP ${response.status}. The setup link was not printed. Fix email delivery, wait at least one minute, then rerun with --resend.`);
  }

  await pool.query("UPDATE admin_auth_tokens SET last_email_sent_at = now(), updated_at = now() WHERE id = $1", [tokenId]);
  console.info(`Owner setup email sent to ${email}. It expires in 20 minutes. The raw link was not printed.`);
} finally {
  await pool.end();
}
