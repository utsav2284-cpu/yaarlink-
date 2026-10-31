import { sql } from "drizzle-orm";
import { check, foreignKey, index, pgTable, uuid, text, integer, timestamp, unique, uniqueIndex } from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    phone: text("phone"),
    role: text("role").notNull().default("brand"),
    passwordHash: text("password_hash").notNull(),
    // Bumped on logout so previously issued session cookies stop working (server-side revocation).
    tokenVersion: integer("token_version").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    // Login identity is case-insensitive even if a future writer forgets to normalize it.
    uniqueIndex("users_email_lower_key").on(sql`lower(${table.email})`),
    check("users_role_check", sql`${table.role} in ('brand', 'creator')`),
    check(
      "users_email_canonical_check",
      sql`${table.email} = lower(btrim(${table.email})) and ${table.email} ~ '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$'`,
    ),
  ],
);

export const brands = pgTable(
  "brands",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    check("brands_status_check", sql`${table.status} = 'active'`),
    check(
      "brands_email_canonical_check",
      sql`${table.email} is null or (${table.email} = lower(btrim(${table.email})) and ${table.email} ~ '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$')`,
    ),
  ],
);

export const creators = pgTable(
  "creators",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    instagram: text("instagram"),
    youtube: text("youtube"),
    profileUrl: text("profile_url"),
    platform: text("platform").notNull().default("Instagram"),
    followers: integer("followers").notNull().default(0),
    category: text("category"),
    languages: text("languages").notNull().default("English"),
    location: text("location"),
    contentTypes: text("content_types").notNull().default("Story"),
    bio: text("bio"),
    status: text("status").notNull().default("pending"),
    verificationCode: text("verification_code"),
    verificationStatus: text("verification_status").notNull().default("unverified"),
    verifiedFollowers: integer("verified_followers"),
    moderationNote: text("moderation_note"),
    reviewedAt: timestamp("reviewed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    // Applications use this as the target of a composite FK, proving that the
    // linked creator profile belongs to the applying user.
    unique("creators_id_user_id_key").on(table.id, table.userId),
    index("creators_public_review_idx").on(table.status, table.verificationStatus, table.createdAt.desc()),
    index("creators_created_at_idx").on(table.createdAt.desc()),
    check("creators_platform_check", sql`${table.platform} in ('Instagram', 'YouTube', 'Both', 'Other')`),
    check(
      "creators_category_check",
      sql`${table.category} is null or ${table.category} in ('Food & Cafe', 'Fashion & Lifestyle', 'Memes & Comedy', 'Education & Motivation', 'Tech & Apps', 'Travel & Local', 'Fitness & Health', 'Beauty & Skincare', 'Finance & Business', 'Music & Entertainment', 'Punjabi Culture', 'Other')`,
    ),
    check(
      "creators_languages_check",
      sql`${table.languages} ~ '^(English|Hindi|Punjabi|Hinglish|Bengali|Marathi|Tamil|Telugu)(, (English|Hindi|Punjabi|Hinglish|Bengali|Marathi|Tamil|Telugu))*$'`,
    ),
    check(
      "creators_content_types_check",
      sql`${table.contentTypes} ~ '^(Story|Reel|Post|UGC Video|YouTube Shorts|YouTube Video)(, (Story|Reel|Post|UGC Video|YouTube Shorts|YouTube Video))*$'`,
    ),
    check("creators_status_check", sql`${table.status} in ('incomplete', 'pending', 'approved', 'rejected', 'suspended')`),
    check(
      "creators_verification_status_check",
      sql`${table.verificationStatus} in ('unverified', 'pending', 'verified', 'failed')`,
    ),
    check("creators_followers_check", sql`${table.followers} between 0 and 100000000`),
    check(
      "creators_verified_followers_check",
      sql`${table.verifiedFollowers} is null or (${table.verifiedFollowers} between 0 and 100000000)`,
    ),
    check(
      "creators_email_canonical_check",
      sql`${table.email} is null or (${table.email} = lower(btrim(${table.email})) and ${table.email} ~ '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$')`,
    ),
  ],
);

export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    businessName: text("business_name").notNull(),
    contactName: text("contact_name"),
    email: text("email"),
    phone: text("phone"),
    title: text("title").notNull(),
    promotionType: text("promotion_type").notNull().default("Product"),
    category: text("category"),
    description: text("description"),
    budget: integer("budget").notNull().default(5000),
    location: text("location"),
    language: text("language").notNull().default("English"),
    targetAudience: text("target_audience"),
    format: text("format").notNull().default("Story"),
    website: text("website"),
    status: text("status").notNull().default("pending"),
    verificationCode: text("verification_code"),
    verificationStatus: text("verification_status").notNull().default("unverified"),
    moderationNote: text("moderation_note"),
    reviewedAt: timestamp("reviewed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("campaigns_public_review_idx").on(table.status, table.verificationStatus, table.createdAt.desc()),
    index("campaigns_owner_created_idx").on(table.ownerId, table.createdAt.desc()),
    index("campaigns_created_at_idx").on(table.createdAt.desc()),
    check(
      "campaigns_promotion_type_check",
      sql`${table.promotionType} in ('Local Business', 'App', 'Website', 'Product', 'Creator / UGC', 'Event')`,
    ),
    check(
      "campaigns_category_check",
      sql`${table.category} is null or ${table.category} in ('Food & Cafe', 'Fashion & Lifestyle', 'Memes & Comedy', 'Education & Motivation', 'Tech & Apps', 'Travel & Local', 'Fitness & Health', 'Beauty & Skincare', 'Finance & Business', 'Music & Entertainment', 'Punjabi Culture', 'Other')`,
    ),
    check(
      "campaigns_language_check",
      sql`${table.language} in ('English', 'Hindi', 'Punjabi', 'Hinglish', 'Bengali', 'Marathi', 'Tamil', 'Telugu')`,
    ),
    check(
      "campaigns_format_check",
      sql`${table.format} in ('Story', 'Reel', 'Post', 'UGC Video', 'YouTube Shorts', 'YouTube Video')`,
    ),
    check("campaigns_status_check", sql`${table.status} in ('pending', 'open', 'rejected', 'closed')`),
    check(
      "campaigns_verification_status_check",
      sql`${table.verificationStatus} in ('unverified', 'pending', 'verified', 'failed')`,
    ),
    check("campaigns_budget_check", sql`${table.budget} between 500 and 10000000`),
    check(
      "campaigns_email_canonical_check",
      sql`${table.email} is null or (${table.email} = lower(btrim(${table.email})) and ${table.email} ~ '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$')`,
    ),
  ],
);

export const applications = pgTable(
  "applications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => creators.id, { onDelete: "cascade" }),
    creatorName: text("creator_name").notNull(),
    creatorContact: text("creator_contact"),
    message: text("message"),
    status: text("status").notNull().default("applied"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    // One application per creator account per campaign, enforced atomically by Postgres.
    unique("applications_campaign_user_unique").on(table.campaignId, table.userId),
    // The linked profile must belong to the applying user, not merely exist.
    foreignKey({
      columns: [table.creatorId, table.userId],
      foreignColumns: [creators.id, creators.userId],
      name: "applications_creator_user_fkey",
    }).onDelete("cascade"),
    index("applications_campaign_created_idx").on(table.campaignId, table.createdAt.desc()),
    index("applications_user_created_idx").on(table.userId, table.createdAt.desc()),
    index("applications_creator_created_idx").on(table.creatorId, table.createdAt.desc()),
    index("applications_campaign_contact_idx").on(table.campaignId, table.creatorContact),
    index("applications_created_at_idx").on(table.createdAt.desc()),
    check("applications_status_check", sql`${table.status} = 'applied'`),
  ],
);

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    kind: text("kind").notNull().default("brand"),
    message: text("message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("contacts_created_at_idx").on(table.createdAt.desc()),
    check("contacts_kind_check", sql`${table.kind} in ('brand', 'creator', 'other')`),
    check(
      "contacts_email_canonical_check",
      sql`${table.email} is null or (${table.email} = lower(btrim(${table.email})) and ${table.email} ~ '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$')`,
    ),
  ],
);

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    reporterUserId: uuid("reporter_user_id").references(() => users.id, { onDelete: "set null" }),
    reporterName: text("reporter_name"),
    reporterContact: text("reporter_contact"),
    reason: text("reason").notNull(),
    details: text("details"),
    status: text("status").notNull().default("open"),
    adminNote: text("admin_note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at"),
  },
  (table) => [
    index("reports_target_status_idx").on(table.targetType, table.targetId, table.status),
    index("reports_status_created_idx").on(table.status, table.createdAt.desc()),
    index("reports_reporter_user_idx").on(table.reporterUserId),
    check("reports_target_type_check", sql`${table.targetType} in ('campaign', 'creator')`),
    check(
      "reports_reason_check",
      sql`${table.reason} in ('impersonation', 'scam', 'spam', 'incorrect-info', 'other')`,
    ),
    check("reports_status_check", sql`${table.status} in ('open', 'resolved', 'dismissed')`),
  ],
);

// Key/value settings for the site owner (e.g. hashed admin password).
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const adminAuditLogs = pgTable(
  "admin_audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    action: text("action").notNull(),
    outcome: text("outcome").notNull().default("success"),
    entity: text("entity"),
    entityId: uuid("entity_id"),
    details: text("details"),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("admin_audit_logs_created_at_idx").on(table.createdAt.desc()),
    index("admin_audit_logs_action_created_at_idx").on(table.action, table.createdAt.desc()),
    index("admin_audit_logs_entity_idx").on(table.entity, table.entityId, table.createdAt.desc()),
    check("admin_audit_logs_action_check", sql`char_length(${table.action}) between 1 and 100`),
    check("admin_audit_logs_outcome_check", sql`${table.outcome} in ('success', 'failure')`),
    check("admin_audit_logs_entity_check", sql`${table.entity} is null or char_length(${table.entity}) <= 60`),
    check("admin_audit_logs_details_check", sql`${table.details} is null or char_length(${table.details}) <= 1000`),
    check("admin_audit_logs_ip_address_check", sql`${table.ipAddress} is null or char_length(${table.ipAddress}) <= 120`),
  ],
);

export type Brand = typeof brands.$inferSelect;
export type Creator = typeof creators.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type Report = typeof reports.$inferSelect;
export type AppUser = typeof users.$inferSelect;
