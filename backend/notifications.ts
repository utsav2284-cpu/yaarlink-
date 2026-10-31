import { db } from "@/backend/db";
import { notifications } from "@/backend/db/schema";
import { sendMarketplaceNotificationEmail } from "@/backend/email";
import type { ApplicationStatus, NotificationKind } from "@/shared/constants";

type NotificationExecutor = Pick<typeof db, "insert">;

export type ApplicationNotificationInput = {
  recipientUserId: string;
  kind: NotificationKind;
  campaignId: string;
  applicationId: string;
  campaignTitle: string;
  actorName?: string | null;
  applicationStatus: ApplicationStatus;
};

const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  applied: "Applied",
  shortlisted: "Shortlisted",
  rejected: "Rejected",
  hired: "Hired",
  completed: "Completed",
  withdrawn: "Withdrawn",
};

function cleanSnapshot(value: string | null | undefined, maxLength: number): string | null {
  const cleaned = value?.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

export async function createApplicationNotification(
  executor: NotificationExecutor,
  input: ApplicationNotificationInput,
) {
  const campaignTitle = cleanSnapshot(input.campaignTitle, 160) ?? "Campaign";
  const [row] = await executor
    .insert(notifications)
    .values({
      userId: input.recipientUserId,
      kind: input.kind,
      campaignId: input.campaignId,
      applicationId: input.applicationId,
      campaignTitle,
      actorName: cleanSnapshot(input.actorName, 120),
      applicationStatus: input.applicationStatus,
    })
    .returning({ id: notifications.id });
  return row;
}

export function buildDashboardUrl(req: Request) {
  const requestOrigin = new URL(req.url).origin;
  let base = requestOrigin;
  const configured = process.env.APP_URL?.trim();
  if (configured) {
    try {
      base = new URL(configured).origin;
    } catch {
      base = requestOrigin;
    }
  }
  return new URL("/dashboard", base).toString();
}

export async function sendApplicationNotificationEmailBestEffort({
  req,
  kind,
  to,
  recipientName,
  campaignTitle,
  actorName,
  applicationStatus,
  decisionNote,
}: {
  req: Request;
  kind: NotificationKind;
  to: string;
  recipientName: string;
  campaignTitle: string;
  actorName?: string | null;
  applicationStatus: ApplicationStatus;
  decisionNote?: string | null;
}) {
  const title = cleanSnapshot(campaignTitle, 160) ?? "Campaign";
  const actor = cleanSnapshot(actorName, 120) ?? "A creator";
  const label = APPLICATION_STATUS_LABELS[applicationStatus];
  const note = cleanSnapshot(decisionNote, 1000);

  const copy =
    kind === "application_received"
      ? {
          subject: `New application for “${title}”`,
          heading: "New creator application",
          message: `${actor} applied to your campaign “${title}”. Review the application in your dashboard to shortlist, hire, or reject it.`,
          detail: null,
        }
      : kind === "application_withdrawn"
        ? {
            subject: `Application withdrawn for “${title}”`,
            heading: "Creator application withdrawn",
            message: `${actor} withdrew their application for your campaign “${title}”.`,
            detail: null,
          }
        : {
            subject: `Application update for “${title}”: ${label}`,
            heading: "Application status updated",
            message: `Your application for “${title}” is now ${label}.`,
            detail: note ? `Brand note: ${note}` : null,
          };

  try {
    await sendMarketplaceNotificationEmail({
      to,
      recipientName,
      subject: copy.subject,
      heading: copy.heading,
      message: copy.message,
      detail: copy.detail,
      dashboardUrl: buildDashboardUrl(req),
    });
    return true;
  } catch (error) {
    // The marketplace action and its in-app notification are already saved;
    // an email-provider problem must not make the user repeat that action.
    console.error("[notifications] marketplace email could not be sent", error);
    return false;
  }
}
