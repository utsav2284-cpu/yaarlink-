import { getSessionUser } from "@/backend/auth";
import { applicationContactOptions, isCompletedCreatorProfile } from "@/backend/application-contact";
import { db } from "@/backend/db";
import { applications, creators } from "@/backend/db/schema";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * Private, reload-safe application state for the signed-in creator. The
 * public campaigns page uses this to keep showing an existing application
 * instead of presenting every campaign as unapplied after a refresh.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return Response.json(
      { error: "Please log in to view your applications", code: "login_required" },
      { status: 401, headers: NO_STORE },
    );
  }

  if (user.role !== "creator") {
    return Response.json(
      { applications: [], creatorProfile: null, contactOptions: [] },
      { headers: NO_STORE },
    );
  }

  const [[creatorProfile], ownApplications] = await Promise.all([
    db.select().from(creators).where(eq(creators.userId, user.id)).limit(1),
    db
      .select({
        id: applications.id,
        campaignId: applications.campaignId,
        creatorName: applications.creatorName,
        creatorContact: applications.creatorContact,
        message: applications.message,
        status: applications.status,
        createdAt: applications.createdAt,
        updatedAt: applications.updatedAt,
      })
      .from(applications)
      .where(eq(applications.userId, user.id))
      .orderBy(desc(applications.updatedAt)),
  ]);

  return Response.json(
    {
      applications: ownApplications,
      creatorProfile: creatorProfile
        ? {
            id: creatorProfile.id,
            name: creatorProfile.name,
            status: creatorProfile.status,
            completed: isCompletedCreatorProfile(creatorProfile),
          }
        : null,
      contactOptions: applicationContactOptions(user, creatorProfile).map((option) => option.value),
    },
    { headers: NO_STORE },
  );
}
