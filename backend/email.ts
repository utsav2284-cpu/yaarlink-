const DEFAULT_RESEND_API_BASE_URL = "https://api.resend.com";
const EMAIL_REQUEST_TIMEOUT_MS = 8_000;

export class EmailDeliveryNotConfiguredError extends Error {
  constructor() {
    super("Email delivery is not configured");
    this.name = "EmailDeliveryNotConfiguredError";
  }
}

function emailConfig() {
  return {
    apiKey: process.env.RESEND_API_KEY?.trim() ?? "",
    from: process.env.EMAIL_FROM?.trim() ?? "",
    baseUrl: (process.env.RESEND_API_BASE_URL?.trim() || DEFAULT_RESEND_API_BASE_URL).replace(/\/+$/, ""),
  };
}

/**
 * Signup verification intentionally fails closed when transactional email is
 * not configured. Creating an unverified account as a fallback would reopen
 * the email-claiming problem this flow exists to prevent.
 */
export function emailDeliveryProblem(): "not_configured" | null {
  const { apiKey, from, baseUrl } = emailConfig();
  if (!apiKey || !from.includes("@")) return "not_configured";
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      return "not_configured";
    }
  } catch {
    return "not_configured";
  }
  return null;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendSignupVerificationEmail({
  to,
  name,
  verificationUrl,
}: {
  to: string;
  name: string;
  verificationUrl: string;
}) {
  if (emailDeliveryProblem()) throw new EmailDeliveryNotConfiguredError();
  const { apiKey, from, baseUrl } = emailConfig();
  const safeName = escapeHtml(name);
  const safeUrl = escapeHtml(verificationUrl);

  const response = await fetch(`${baseUrl}/emails`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Verify your email for YaarLink",
      text: [
        `Hi ${name},`,
        "",
        "Finish creating your YaarLink account by verifying this email address:",
        verificationUrl,
        "",
        "The link expires in 30 minutes. You will be asked for the password you chose during signup.",
        "",
        "If you did not request this, you can ignore this email. No account will be created.",
      ].join("\n"),
      html: `
        <div style="font-family:Arial,sans-serif;color:#1c1917;line-height:1.5;max-width:560px;margin:0 auto;padding:24px">
          <h1 style="font-size:24px;margin:0 0 16px">Verify your email for YaarLink</h1>
          <p>Hi ${safeName},</p>
          <p>Finish creating your YaarLink account by verifying this email address.</p>
          <p style="margin:24px 0">
            <a href="${safeUrl}" style="background:#e4572e;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px;display:inline-block">Verify email</a>
          </p>
          <p>The link expires in 30 minutes. You will be asked for the password you chose during signup.</p>
          <p>If the button does not work, copy and paste this address into your browser:</p>
          <p style="word-break:break-all"><a href="${safeUrl}">${safeUrl}</a></p>
          <p style="color:#57534e">If you did not request this, you can ignore this email. No account will be created.</p>
        </div>
      `,
    }),
    signal: AbortSignal.timeout(EMAIL_REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Email provider returned HTTP ${response.status}`);
  }
}
