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

function cleanSubject(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 140);
}

async function sendEmail({
  to,
  subject,
  text,
  html,
}: {
  to: string;
  subject: string;
  text: string;
  html: string;
}) {
  if (emailDeliveryProblem()) throw new EmailDeliveryNotConfiguredError();
  const { apiKey, from, baseUrl } = emailConfig();

  const response = await fetch(`${baseUrl}/emails`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: cleanSubject(subject),
      text,
      html,
    }),
    signal: AbortSignal.timeout(EMAIL_REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Email provider returned HTTP ${response.status}`);
  }
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
  const safeName = escapeHtml(name);
  const safeUrl = escapeHtml(verificationUrl);

  await sendEmail({
    to,
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
  });
}

/**
 * Best-effort marketplace emails use the same provider path, but callers keep
 * the already-saved application/decision even if this notification fails.
 */
export async function sendMarketplaceNotificationEmail({
  to,
  recipientName,
  subject,
  heading,
  message,
  detail,
  dashboardUrl,
}: {
  to: string;
  recipientName: string;
  subject: string;
  heading: string;
  message: string;
  detail?: string | null;
  dashboardUrl: string;
}) {
  const safeName = escapeHtml(recipientName);
  const safeHeading = escapeHtml(heading);
  const safeMessage = escapeHtml(message);
  const safeDetail = detail ? escapeHtml(detail) : "";
  const safeUrl = escapeHtml(dashboardUrl);

  await sendEmail({
    to,
    subject,
    text: [
      `Hi ${recipientName},`,
      "",
      message,
      ...(detail ? ["", detail] : []),
      "",
      "Open your YaarLink dashboard:",
      dashboardUrl,
    ].join("\n"),
    html: `
        <div style="font-family:Arial,sans-serif;color:#1c1917;line-height:1.5;max-width:560px;margin:0 auto;padding:24px">
          <h1 style="font-size:24px;margin:0 0 16px">${safeHeading}</h1>
          <p>Hi ${safeName},</p>
          <p>${safeMessage}</p>
          ${safeDetail ? `<p style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:12px">${safeDetail}</p>` : ""}
          <p style="margin:24px 0">
            <a href="${safeUrl}" style="background:#e4572e;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px;display:inline-block">Open dashboard</a>
          </p>
          <p style="color:#57534e">You received this because of activity on your YaarLink account.</p>
        </div>
      `,
  });
}

async function sendAccountActionEmail({
  to,
  name,
  subject,
  heading,
  intro,
  actionLabel,
  actionUrl,
  expiryText,
  ignoreText,
}: {
  to: string;
  name: string;
  subject: string;
  heading: string;
  intro: string;
  actionLabel: string;
  actionUrl: string;
  expiryText: string;
  ignoreText: string;
}) {
  const safeName = escapeHtml(name);
  const safeHeading = escapeHtml(heading);
  const safeIntro = escapeHtml(intro);
  const safeLabel = escapeHtml(actionLabel);
  const safeUrl = escapeHtml(actionUrl);
  const safeExpiry = escapeHtml(expiryText);
  const safeIgnore = escapeHtml(ignoreText);

  await sendEmail({
    to,
    subject,
    text: [
      `Hi ${name},`,
      "",
      intro,
      "",
      actionUrl,
      "",
      expiryText,
      "",
      ignoreText,
    ].join("\n"),
    html: `
        <div style="font-family:Arial,sans-serif;color:#1c1917;line-height:1.5;max-width:560px;margin:0 auto;padding:24px">
          <h1 style="font-size:24px;margin:0 0 16px">${safeHeading}</h1>
          <p>Hi ${safeName},</p>
          <p>${safeIntro}</p>
          <p style="margin:24px 0">
            <a href="${safeUrl}" style="background:#e4572e;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px;display:inline-block">${safeLabel}</a>
          </p>
          <p>${safeExpiry}</p>
          <p>If the button does not work, copy and paste this address into your browser:</p>
          <p style="word-break:break-all"><a href="${safeUrl}">${safeUrl}</a></p>
          <p style="color:#57534e">${safeIgnore}</p>
        </div>
      `,
  });
}

export async function sendPasswordResetEmail({ to, name, resetUrl }: { to: string; name: string; resetUrl: string }) {
  await sendAccountActionEmail({
    to,
    name,
    subject: "Reset your YaarLink password",
    heading: "Reset your password",
    intro: "We received a request to reset the password for your YaarLink account.",
    actionLabel: "Reset password",
    actionUrl: resetUrl,
    expiryText: "This one-time link expires in 30 minutes. Resetting your password signs out all devices.",
    ignoreText: "If you did not request this, you can ignore this email and your password will not change.",
  });
}

export async function sendExistingAccountEmailVerificationEmail({
  to,
  name,
  verificationUrl,
}: {
  to: string;
  name: string;
  verificationUrl: string;
}) {
  await sendAccountActionEmail({
    to,
    name,
    subject: "Verify your YaarLink account email",
    heading: "Verify your account email",
    intro: "Please confirm that this is the email address for your YaarLink account.",
    actionLabel: "Verify email",
    actionUrl: verificationUrl,
    expiryText: "This one-time link expires in 24 hours.",
    ignoreText: "If you did not request this, you can ignore this email.",
  });
}

export async function sendEmailChangeVerificationEmail({
  to,
  name,
  verificationUrl,
}: {
  to: string;
  name: string;
  verificationUrl: string;
}) {
  await sendAccountActionEmail({
    to,
    name,
    subject: "Confirm your new YaarLink email",
    heading: "Confirm your new email",
    intro: "Please confirm this address as the new login and recovery email for your YaarLink account.",
    actionLabel: "Confirm new email",
    actionUrl: verificationUrl,
    expiryText: "This one-time link expires in 30 minutes. Confirming it signs out all devices, after which you will log in with this new address.",
    ignoreText: "If you did not request this change, ignore this email. The account email will not change unless this link is confirmed.",
  });
}

export async function sendAccountSecurityNoticeEmail({
  to,
  name,
  subject,
  heading,
  message,
  actionLabel,
  actionUrl,
}: {
  to: string;
  name: string;
  subject: string;
  heading: string;
  message: string;
  actionLabel: string;
  actionUrl: string;
}) {
  const safeName = escapeHtml(name);
  const safeHeading = escapeHtml(heading);
  const safeMessage = escapeHtml(message);
  const safeLabel = escapeHtml(actionLabel);
  const safeUrl = escapeHtml(actionUrl);

  await sendEmail({
    to,
    subject,
    text: [`Hi ${name},`, "", message, "", actionUrl].join("\n"),
    html: `
        <div style="font-family:Arial,sans-serif;color:#1c1917;line-height:1.5;max-width:560px;margin:0 auto;padding:24px">
          <h1 style="font-size:24px;margin:0 0 16px">${safeHeading}</h1>
          <p>Hi ${safeName},</p>
          <p>${safeMessage}</p>
          <p style="margin:24px 0">
            <a href="${safeUrl}" style="background:#1c1917;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px;display:inline-block">${safeLabel}</a>
          </p>
          <p style="color:#57534e">This notice was sent because of security activity on your YaarLink account.</p>
        </div>
      `,
  });
}
