import { pgTable, uuid, text, integer, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  role: text("role").notNull().default("brand"),
  passwordHash: text("password_hash").notNull(),
  // Bumped on logout so previously issued session cookies stop working (server-side revocation).
  tokenVersion: integer("token_version").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const brands = pgTable("brands", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  status: text("status").default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const creators = pgTable("creators", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").unique(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  instagram: text("instagram"),
  youtube: text("youtube"),
  profileUrl: text("profile_url"),
  platform: text("platform").default("Instagram"),
  followers: integer("followers").default(0),
  category: text("category"),
  languages: text("languages").default("English"),
  location: text("location"),
  contentTypes: text("content_types").default("Story"),
  bio: text("bio"),
  status: text("status").default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const campaigns = pgTable("campaigns", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id"),
  businessName: text("business_name").notNull(),
  contactName: text("contact_name"),
  email: text("email"),
  phone: text("phone"),
  title: text("title").notNull(),
  promotionType: text("promotion_type").default("Product"),
  category: text("category"),
  description: text("description"),
  budget: integer("budget").default(5000),
  location: text("location"),
  language: text("language").default("English"),
  targetAudience: text("target_audience"),
  format: text("format").default("Story"),
  website: text("website"),
  status: text("status").default("open"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const applications = pgTable("applications", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignId: uuid("campaign_id"),
  userId: uuid("user_id"),
  creatorId: uuid("creator_id"),
  creatorName: text("creator_name"),
  creatorContact: text("creator_contact"),
  message: text("message"),
  status: text("status").default("applied"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const contacts = pgTable("contacts", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  kind: text("kind").default("brand"),
  message: text("message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Key/value settings for the site owner (e.g. hashed admin password).
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Brand = typeof brands.$inferSelect;
export type Creator = typeof creators.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type AppUser = typeof users.$inferSelect;
