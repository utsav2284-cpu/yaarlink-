import { and, desc, eq, gt, inArray, isNull, ne } from "drizzle-orm";
import { hashPassword, verifyLoginPassword, verifyPassword } from "@/backend/auth";
import { db } from "@/backend/db";
import { localPasswordPolicyProblem } from "@/backend/password-policy";
import {
  accountTokens,
  applications,
  brands,
  campaigns,
  creators,
  notifications,
  reports,
  userSessions,
  users,
} from "@/backend/db/schema";
import { availableUserRoles, primaryUserRole, type UserRole } from "@/shared/user-roles";

export function describeUserAgent(userAgent: string | null | undefined) {
  const ua = userAgent ?? "";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /SamsungBrowser\//.test(ua)
      ? "Samsung Internet"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\/|Chromium\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : null;
  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Windows/.test(ua)
          ? "Windows"
          : /Macintosh|Mac OS X/.test(ua)
            ? "macOS"
            : /CrOS/.test(ua)
              ? "ChromeOS"
              : /Linux/.test(ua)
                ? "Linux"
                : null;
  return {
    browser,
    os,
    label: browser && os ? `${browser} on ${os}` : browser ?? os ?? "Browser/device",
  };
}

export async function listActiveUserSessions(userId: string, currentSessionId: string) {
  const now = new Date();
  const rows = await db
    .select({
      id: userSessions.id,
      userAgent: userSessions.userAgent,
      createdAt: userSessions.createdAt,
      lastSeenAt: userSessions.lastSeenAt,
      expiresAt: userSessions.expiresAt,
    })
    .from(userSessions)
    .where(and(eq(userSessions.userId, userId), isNull(userSessions.revokedAt), gt(userSessions.expiresAt, now)))
    .orderBy(desc(userSessions.lastSeenAt))
    .limit(25);

  return rows
    .map((row) => ({
      id: row.id,
      current: row.id === currentSessionId,
      ...describeUserAgent(row.userAgent),
      createdAt: row.createdAt,
      // This authenticated request is itself activity, even though the DB
      // timestamp is only persisted periodically to avoid a write per request.
      lastSeenAt: row.id === currentSessionId && row.lastSeenAt.getTime() < now.getTime() ? now : row.lastSeenAt,
      expiresAt: row.expiresAt,
    }))
    .sort((a, b) => Number(b.current) - Number(a.current) || b.lastSeenAt.getTime() - a.lastSeenAt.getTime());
}

export async function getPendingEmailChange(userId: string) {
  const now = new Date();
  const [row] = await db
    .select({ email: accountTokens.targetEmail, expiresAt: accountTokens.expiresAt })
    .from(accountTokens)
    .where(
      and(
        eq(accountTokens.userId, userId),
        eq(accountTokens.purpose, "email_change"),
        isNull(accountTokens.usedAt),
        gt(accountTokens.expiresAt, now),
      ),
    )
    .limit(1);
  return row?.email ? { email: row.email, expiresAt: row.expiresAt } : null;
}

export type PrimaryRoleChangeResult =
  | { kind: "changed"; user: { id: string; name: string; email: string; role: string } }
  | { kind: "invalid_session" };

/**
 * Change only the preferred starting workspace. Both workspaces remain
 * available either way. Mirror signup's starter-row behavior so the newly
 * preferred side has its one-to-one profile record when one is expected.
 */
export async function changeUserPrimaryRole(userId: string, role: UserRole): Promise<PrimaryRoleChangeResult> {
  return db.transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1).for("update");
    if (!user) return { kind: "invalid_session" } as const;

    const [updated] = await tx
      .update(users)
      .set({ role })
      .where(eq(users.id, user.id))
      .returning({ id: users.id, name: users.name, email: users.email, role: users.role });

    if (role === "brand") {
      await tx
        .insert(brands)
        .values({ userId: user.id, name: user.name, email: user.email, phone: user.phone, status: "active" })
        .onConflictDoNothing({ target: brands.userId });
    } else {
      await tx
        .insert(creators)
        .values({ userId: user.id, name: user.name, email: user.email, phone: user.phone, status: "incomplete" })
        .onConflictDoNothing({ target: creators.userId });
    }

    return { kind: "changed", user: updated } as const;
  });
}

export async function verifyUserPassword(userId: string, password: string) {
  const [user] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, userId)).limit(1);
  return (await verifyLoginPassword(password, user?.passwordHash)).ok;
}

export type PasswordChangeResult =
  | { kind: "changed"; tokenVersion: number; user: { id: string; name: string; email: string; role: string } }
  | { kind: "wrong_password" }
  | { kind: "same_password" }
  | { kind: "invalid_password" }
  | { kind: "invalid_session" };

export async function changeUserPasswordKeepingSession({
  userId,
  sessionId,
  currentPassword,
  newPassword,
}: {
  userId: string;
  sessionId: string;
  currentPassword: string;
  newPassword: string;
}): Promise<PasswordChangeResult> {
  return db.transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1).for("update");
    if (!user) return { kind: "invalid_session" } as const;

    const now = new Date();
    const [session] = await tx
      .select()
      .from(userSessions)
      .where(and(eq(userSessions.id, sessionId), eq(userSessions.userId, user.id)))
      .limit(1)
      .for("update");
    if (!session || session.revokedAt || session.expiresAt.getTime() <= now.getTime() || session.tokenVersion !== user.tokenVersion) {
      return { kind: "invalid_session" } as const;
    }

    // Defense in depth: the API route performs the full breach-corpus check,
    // while this transaction still refuses a locally invalid new password if
    // it is ever called from another server-side path.
    if (localPasswordPolicyProblem(newPassword, { email: user.email, name: user.name, phone: user.phone })) {
      return { kind: "invalid_password" } as const;
    }
    if (!(await verifyPassword(currentPassword, user.passwordHash)).ok) return { kind: "wrong_password" } as const;
    if ((await verifyPassword(newPassword, user.passwordHash)).ok) return { kind: "same_password" } as const;

    const newTokenVersion = user.tokenVersion + 1;
    const [updated] = await tx
      .update(users)
      .set({ passwordHash: await hashPassword(newPassword), tokenVersion: newTokenVersion })
      .where(eq(users.id, user.id))
      .returning({ id: users.id, name: users.name, email: users.email, role: users.role });

    await tx
      .update(userSessions)
      .set({ tokenVersion: newTokenVersion, lastSeenAt: now, expiresAt: new Date(now.getTime() + 7 * 864e5) })
      .where(eq(userSessions.id, session.id));
    await tx
      .update(userSessions)
      .set({ revokedAt: now })
      .where(and(eq(userSessions.userId, user.id), ne(userSessions.id, session.id), isNull(userSessions.revokedAt)));
    await tx
      .update(accountTokens)
      .set({ usedAt: now, updatedAt: now })
      .where(eq(accountTokens.userId, user.id));

    return { kind: "changed", tokenVersion: newTokenVersion, user: updated } as const;
  });
}

export type PhoneChangeResult =
  | { kind: "changed"; phone: string | null }
  | { kind: "wrong_password" }
  | { kind: "invalid_session" };

export async function changeUserPhone({
  userId,
  currentPassword,
  phone,
}: {
  userId: string;
  currentPassword: string;
  phone: string | null;
}): Promise<PhoneChangeResult> {
  return db.transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1).for("update");
    if (!user) return { kind: "invalid_session" } as const;
    if (!(await verifyPassword(currentPassword, user.passwordHash)).ok) return { kind: "wrong_password" } as const;
    const [updated] = await tx
      .update(users)
      .set({ phone })
      .where(eq(users.id, user.id))
      .returning({ phone: users.phone });
    return { kind: "changed", phone: updated.phone } as const;
  });
}

export type AccountDeletionResult =
  | { kind: "deleted"; user: { id: string; name: string; email: string; role: string } }
  | { kind: "wrong_password" }
  | { kind: "confirmation_mismatch" }
  | { kind: "invalid_session" };

export async function deleteUserAccount({
  userId,
  currentPassword,
  confirmationEmail,
}: {
  userId: string;
  currentPassword: string;
  confirmationEmail: string;
}): Promise<AccountDeletionResult> {
  return db.transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1).for("update");
    if (!user) return { kind: "invalid_session" } as const;
    if (!(await verifyPassword(currentPassword, user.passwordHash)).ok) return { kind: "wrong_password" } as const;
    if (confirmationEmail.toLowerCase().trim() !== user.email) return { kind: "confirmation_mismatch" } as const;

    const deletedUser = { id: user.id, name: user.name, email: user.email, role: user.role };
    await tx
      .update(reports)
      .set({ reporterName: null, reporterContact: null })
      .where(eq(reports.reporterUserId, user.id));
    // Foreign-key cascades remove the role profile, owned campaigns,
    // applications, notifications, sessions and account tokens. Reports the
    // user submitted keep the report itself for moderation history but lose
    // the reporter user reference through ON DELETE SET NULL.
    await tx.delete(users).where(eq(users.id, user.id));
    return { kind: "deleted", user: deletedUser } as const;
  });
}

function omitFields<T extends Record<string, unknown>>(row: T, fields: string[]) {
  return Object.fromEntries(Object.entries(row).filter(([field]) => !fields.includes(field)));
}

export async function buildAccountExport(userId: string) {
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      role: users.role,
      emailVerifiedAt: users.emailVerifiedAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return null;

  const [brandRows, creatorRows, ownedCampaigns, submittedApplications, userNotifications, submittedReports, sessionRows, pendingEmailChange] =
    await Promise.all([
      db.select().from(brands).where(eq(brands.userId, userId)),
      db.select().from(creators).where(eq(creators.userId, userId)),
      db.select().from(campaigns).where(eq(campaigns.ownerId, userId)).orderBy(desc(campaigns.createdAt)),
      db.select().from(applications).where(eq(applications.userId, userId)).orderBy(desc(applications.createdAt)),
      db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)),
      db.select().from(reports).where(eq(reports.reporterUserId, userId)).orderBy(desc(reports.createdAt)),
      db.select().from(userSessions).where(eq(userSessions.userId, userId)).orderBy(desc(userSessions.lastSeenAt)).limit(100),
      getPendingEmailChange(userId),
    ]);

  const campaignIds = ownedCampaigns.map((campaign) => campaign.id);
  const receivedApplications = campaignIds.length
    ? await db.select().from(applications).where(inArray(applications.campaignId, campaignIds)).orderBy(desc(applications.createdAt))
    : [];

  const primaryRole = primaryUserRole(user.role);

  return {
    exportVersion: 1,
    exportedAt: new Date().toISOString(),
    account: { ...user, role: primaryRole, primaryRole, availableRoles: availableUserRoles() },
    pendingEmailChange,
    brandProfile: brandRows[0] ?? null,
    creatorProfile: creatorRows[0] ? omitFields(creatorRows[0] as unknown as Record<string, unknown>, ["verificationCode"]) : null,
    campaigns: ownedCampaigns.map((row) => omitFields(row as unknown as Record<string, unknown>, ["verificationCode"])),
    applicationsSubmitted: submittedApplications,
    applicationsReceived: receivedApplications,
    notifications: userNotifications,
    reportsSubmitted: submittedReports,
    sessions: sessionRows.map((row) => ({
      device: describeUserAgent(row.userAgent),
      createdAt: row.createdAt,
      lastSeenAt: row.lastSeenAt,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
    })),
    excludedForSecurity: ["password hashes", "one-time token hashes", "session cookie signatures", "listing verification codes"],
  };
}
