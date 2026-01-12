import { pgTable, uuid, text, timestamp, integer, boolean, jsonb, unique, numeric, serial, decimal } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Tenants table - core of multi-tenancy
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  subdomain: text("subdomain").notNull().unique(),
  name: text("name").notNull(),
  tagline: text("tagline"),
  logoUrl: text("logo_url"),
  heroImageUrl: text("hero_image_url"),
  branding: jsonb("branding").$type<{
    primaryColor?: string;
    secondaryColor?: string;
    accentColor?: string;
    successColor?: string;
    warningColor?: string;
    destructiveColor?: string;
  }>(),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  footerText: text("footer_text"), // Custom footer text (e.g., "© 2024 Happy Paws Rescue. 501(c)(3) Non-Profit")
  // Custom domain settings
  customDomain: text("custom_domain").unique(), // e.g., "fluffypaws.org" or "www.fluffypaws.org"
  customDomainVerified: boolean("custom_domain_verified").notNull().default(false),
  // Payment integration settings
  stripeLink: text("stripe_link"), // Custom Stripe payment link
  // Stripe settings (encrypted API keys per tenant)
  stripePublishableKey: text("stripe_publishable_key"), // Publishable key (safe to expose)
  stripeSecretKeyEncrypted: text("stripe_secret_key_encrypted"), // Encrypted secret key
  stripeWebhookSecretEncrypted: text("stripe_webhook_secret_encrypted"), // Encrypted webhook secret
  stripeEnabled: boolean("stripe_enabled").notNull().default(false), // Whether Stripe is configured
  stripeConnectedAccountId: text("stripe_connected_account_id"), // Stripe Connect account ID (Standard Connect - tenant owns account)
  stripeConnectedAt: timestamp("stripe_connected_at"), // When Stripe was connected via OAuth
  // Adoption fee settings
  passFeesToAdopter: boolean("pass_fees_to_adopter").notNull().default(false), // Whether to add processing + platform fees to adoption fee (paid by adopter)
  // Email service settings (encrypted API keys per tenant)
  resendApiKeyEncrypted: text("resend_api_key_encrypted"), // Resend API key for transactional emails
  resendFromEmail: text("resend_from_email"), // From email address (e.g., noreply@rescue.org)
  resendFromName: text("resend_from_name"), // From name (e.g., Happy Paws Rescue)
  resendEnabled: boolean("resend_enabled").notNull().default(false), // Whether Resend is configured
  emailCopyRecipients: text("email_copy_recipients").array(), // Email addresses to CC on inbound emails (e.g., ["director@gmail.com"])
  constantContactApiKeyEncrypted: text("constant_contact_api_key_encrypted"), // Constant Contact API key
  constantContactEnabled: boolean("constant_contact_enabled").notNull().default(false), // Whether Constant Contact is configured
  // Email usage tracking (for platform-wide API key quota management)
  emailsSentThisMonth: integer("emails_sent_this_month").notNull().default(0), // Counter reset monthly
  emailQuotaLimit: integer("email_quota_limit").notNull().default(500), // Monthly email limit (default 500 for starter)
  lastEmailQuotaReset: timestamp("last_email_quota_reset").notNull().defaultNow(), // Last time counter was reset
  // Platform subscription management
  subscriptionTier: text("subscription_tier").notNull().default("free").$type<"free" | "professional">(),
  subscriptionStatus: text("subscription_status").notNull().default("active").$type<"pending" | "active" | "trial" | "cancelled" | "suspended">(),
  trialEndsAt: timestamp("trial_ends_at"), // When Pro trial expires
  proTrialUsed: boolean("pro_trial_used").notNull().default(false), // Whether tenant has used their free 14-day Pro trial
  // Stripe subscription tracking (for platform-level billing)
  stripeCustomerId: text("stripe_customer_id"), // Stripe customer ID for this tenant
  stripeSubscriptionId: text("stripe_subscription_id"), // Active Stripe subscription ID
  stripePriceId: text("stripe_price_id"), // Stripe price ID for current tier
  // Setup wizard tracking
  wizardCompleted: boolean("wizard_completed").notNull().default(false), // Whether setup wizard has been completed
  wizardStep: integer("wizard_step").notNull().default(0), // Current wizard step (0-7)
  wizardSkipped: boolean("wizard_skipped").notNull().default(false), // Whether wizard was explicitly skipped
  // Google Ads Grant integration settings (encrypted credentials per tenant)
  googleAdsCustomerId: text("google_ads_customer_id"), // Google Ads Customer ID (e.g., "123-456-7890")
  googleAdsClientIdEncrypted: text("google_ads_client_id_encrypted"), // Encrypted OAuth Client ID
  googleAdsClientSecretEncrypted: text("google_ads_client_secret_encrypted"), // Encrypted OAuth Client Secret
  googleAdsDeveloperToken: text("google_ads_developer_token"), // Developer token (basic access is fine)
  googleAdsRefreshTokenEncrypted: text("google_ads_refresh_token_encrypted"), // Encrypted OAuth Refresh Token
  googleAdsConversionActionId: text("google_ads_conversion_action_id"), // Conversion Action ID for tracking
  googleAdsEnabled: boolean("google_ads_enabled").notNull().default(false), // Whether Google Ads is configured
  // Canva Button API integration (for designing adoption flyers)
  canvaApiKey: text("canva_api_key"), // Canva Button API key (publishable, safe to expose to frontend)
  canvaEnabled: boolean("canva_enabled").notNull().default(false), // Whether Canva is configured
  // Twilio SMS integration (for transport alerts and foster privacy messaging)
  twilioAccountSidEncrypted: text("twilio_account_sid_encrypted"), // Encrypted Twilio Account SID
  twilioAuthTokenEncrypted: text("twilio_auth_token_encrypted"), // Encrypted Twilio Auth Token
  twilioPhoneNumber: text("twilio_phone_number"), // Twilio phone number (e.g., "+15551234567")
  twilioEnabled: boolean("twilio_enabled").notNull().default(false), // Whether Twilio is configured
  // DocuSign eSignature integration (for adoption contracts)
  docusignIntegrationKeyEncrypted: text("docusign_integration_key_encrypted"), // Encrypted Integration Key (Client ID)
  docusignUserIdEncrypted: text("docusign_user_id_encrypted"), // Encrypted User ID (GUID to impersonate)
  docusignAccountIdEncrypted: text("docusign_account_id_encrypted"), // Encrypted Account ID
  docusignPrivateKeyEncrypted: text("docusign_private_key_encrypted"), // Encrypted RSA Private Key for JWT
  docusignEnvironment: text("docusign_environment").$type<"demo" | "production">().default("demo"), // API environment
  docusignConnectKeyEncrypted: text("docusign_connect_key_encrypted"), // Encrypted Connect Key for webhook HMAC verification
  docusignEnabled: boolean("docusign_enabled").notNull().default(false), // Whether DocuSign is configured
  // Onboarding email tracking
  onboardingEmailsSent: jsonb("onboarding_emails_sent").$type<{
    day2?: string; // ISO date when Day 2 email was sent
    day5?: string; // ISO date when Day 5 email was sent
  }>().default({}),
  // Hero section customization
  heroHeadline: text("hero_headline"), // Custom headline (if null, uses org name)
  heroButtonText: text("hero_button_text"), // Primary CTA text (default: "Meet Our Pets")
  heroButton2Text: text("hero_button2_text"), // Secondary CTA text (default: "Donate Now")
  // Announcement bar (urgent banner above hero)
  announcementBar: jsonb("announcement_bar").$type<{
    enabled?: boolean;
    text?: string; // e.g., "We urgently need fosters!"
    linkText?: string; // e.g., "Learn More"
    linkUrl?: string; // e.g., "/foster"
    style?: "info" | "warning" | "urgent"; // Color scheme
  }>(),
  // Action Circle configuration for hero section (rotating CTA with hover effects)
  actionCircle: jsonb("action_circle").$type<{
    enabled?: boolean;
    rotationSpeed?: number; // Seconds per rotation (default 5)
    position?: "top-right" | "bottom-right" | "center"; // Position in hero section (default top-right)
    size?: "sm" | "md" | "lg"; // Size of the circle (default md)
    actions?: {
      adopt?: { imageUrl?: string; title?: string; description?: string };
      foster?: { imageUrl?: string; title?: string; description?: string };
      volunteer?: { imageUrl?: string; title?: string; description?: string };
      donate?: { imageUrl?: string; title?: string; description?: string };
    };
  }>(),
  // Mascot widget configuration (fixed video in corner with speech bubble)
  mascot: jsonb("mascot").$type<{
    enabled?: boolean;
    speechText?: string; // Custom speech bubble text (default: "[Rescue Name] needs you!")
  }>(),
  // Donation section customization
  donationSection: jsonb("donation_section").$type<{
    sectionHeading?: string; // Main heading (default: "Support Our Mission")
    sectionDescription?: string; // Description below heading
    monthlyGivingTitle?: string; // Monthly giving card title (default: "Become a Monthly Guardian")
    monthlyGivingDescription?: string; // Description text (default: "Join The Pack to provide predictable support...")
    monthlyGivingIcon?: "shield" | "heart" | "paw" | "star" | "hand-heart" | "users" | "home"; // Icon choice
    oneTimeButtonText?: string; // One-time button text (default: "One-Time ($50)")
    monthlyButtonText?: string; // Monthly button text (default: "Monthly ($10)")
    // Donate page customization
    pageTitle?: string; // Main page title (default: "Become a Monthly Guardian")
    pageSubtitle?: string; // Page subtitle text
    oneTimeAmounts?: number[]; // Preset one-time amounts (default: [10, 20, 50, 100])
    showCustomAmount?: boolean; // Show custom amount field (default: true)
    mailingAddressLabel?: string; // Label for mailing section (default: "Prefer to mail a check? Send to:")
    donateMailingAddress?: string; // Separate mailing address for donations (falls back to footerAddress if empty)
  }>(),
  
  // Mission statement / About Us (supports markdown for rich text)
  missionStatement: text("mission_statement"),
  // Footer customization
  footerHours: text("footer_hours"), // Business hours (e.g., "Mon-Fri: 9am-5pm, Sat: 10am-4pm")
  footerAddress: text("footer_address"), // Physical address
  sponsorLogos: jsonb("sponsor_logos").$type<{
    id: string;
    imageUrl: string;
    altText: string;
    linkUrl?: string;
  }[]>(),
  
  // ===== NONPROFIT COMPLIANCE INTEGRATIONS =====
  
  // Shelter Animals Count (SAC) configuration
  sacSettings: jsonb("sac_settings").$type<{
    enabled?: boolean;
    statusMapping?: Record<string, string>; // Maps tenant statuses to SAC standard statuses
    lastExportMonth?: string; // YYYY-MM of last successful export
    lastValidationRun?: string; // ISO date of last validation check
  }>(),
  
  // Transparency Vault (Candid/GuideStar) configuration
  transparencyVault: jsonb("transparency_vault").$type<{
    enabled?: boolean;
    publicSlug?: string; // e.g., "happy-paws" for /transparency/happy-paws
    selectedMetric?: "annual_adoptions" | "save_rate" | "spay_neuter_count" | "animals_helped";
    ein?: string; // Employer Identification Number (e.g., "12-3456789")
    boardDemographics?: {
      totalMembers?: number;
      femaleCount?: number;
      maleCount?: number;
      nonBinaryCount?: number;
      diversityStatement?: string;
    };
  }>(),
  
  // Impact Dashboard (Charity Navigator) configuration
  impactSettings: jsonb("impact_settings").$type<{
    enabled?: boolean;
    excludeOwnerRequestedEuthanasia?: boolean; // Toggle to exclude ORE from LRR denominator
    widgetToken?: string; // Signed token for embeddable widget
    cachedLrr?: number; // Cached Live Release Rate (0-100)
    cachedLrrDate?: string; // ISO date when LRR was last calculated
    widgetStyle?: "badge" | "card" | "minimal"; // Widget display style
  }>(),
  
  // GreatNonprofits Review Automation configuration
  greatNonprofitsSettings: jsonb("great_nonprofits_settings").$type<{
    enabled?: boolean;
    profileUrl?: string; // Link to GreatNonprofits profile page
    delayDays?: number; // Days after adoption to send review request (default: 7)
    emailSubject?: string; // Custom email subject
    emailTemplate?: string; // Custom email body template
    totalReviewsSent?: number; // Counter for reviews sent
    lastReviewSentAt?: string; // ISO date of last review request
  }>(),
  
  // Weekly Volunteer Schedule Digest
  volunteerDigestSettings: jsonb("volunteer_digest_settings").$type<{
    enabled?: boolean;
    dayOfWeek?: "sunday" | "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday"; // Day to send digest (default: sunday)
    sendTime?: string; // Time to send (HH:mm format, default: "08:00")
    includeUpcomingDays?: number; // How many days ahead to include (default: 7)
    lastSentAt?: string; // ISO date of last digest sent
  }>(),
  
  // QR Code donation landing page settings (mobile-optimized /give page)
  donationLandingEnabled: boolean("donation_landing_enabled").notNull().default(true),
  donationLandingHeader: text("donation_landing_header"), // e.g., "Thank you for supporting Haseya's."
  donationLandingButtonLabel: text("donation_landing_button_label"), // e.g., "Donate Online (Credit/Debit)"
  donationLandingButtonUrl: text("donation_landing_button_url"), // Custom URL override for donation button
  donationLandingMailingAddress: text("donation_landing_mailing_address"), // e.g., "PO Box 123, City, ST 12345"
  donationLandingMailingText: text("donation_landing_mailing_text"), // e.g., "Prefer to mail a check? Send to:"
  
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTenantSchema = createInsertSchema(tenants).omit({
  id: true,
  createdAt: true,
});
export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type Tenant = typeof tenants.$inferSelect;

// Users table - tenant-scoped authentication
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  fullName: text("full_name").notNull(),
  phone: text("phone"), // For SMS broadcasts
  roles: text("roles").array().notNull().$type<("admin" | "board_member" | "staff" | "foster" | "volunteer" | "platform_admin")[]>(),
  isActive: boolean("is_active").notNull().default(true),
  // MFA fields
  mfaEnabled: boolean("mfa_enabled").notNull().default(false),
  mfaSecret: text("mfa_secret"), // Encrypted TOTP secret
  mfaBackupCodes: text("mfa_backup_codes").array(), // Hashed backup codes
  // Email deliverability tracking
  emailBounced: boolean("email_bounced").notNull().default(false),
  emailBouncedAt: timestamp("email_bounced_at"),
  emailComplaint: boolean("email_complaint").notNull().default(false),
  emailComplaintAt: timestamp("email_complaint_at"),
  // SMS notification preferences
  smsOptIn: boolean("sms_opt_in").notNull().default(false), // User opted in to SMS notifications
  smsOptOutAt: timestamp("sms_opt_out_at"), // When they opted out (if STOP received)
  // Foster profile fields (for smart matching)
  fosterStatus: text("foster_status").$type<"active" | "on_break" | "full">(), // Foster availability status
  hasCats: boolean("has_cats"), // Foster home has cats
  hasKids: boolean("has_kids"), // Foster home has children
  hasFencedYard: boolean("has_fenced_yard"), // Foster home has fenced yard
  sizePreference: text("size_preference").$type<"small" | "medium" | "large" | "any">(), // Preferred animal size
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  uniqueEmail: unique().on(table.tenantId, table.email),
}));

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Password reset tokens - for password reset flow
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPasswordResetTokenSchema = createInsertSchema(passwordResetTokens).omit({
  id: true,
  createdAt: true,
});
export type InsertPasswordResetToken = z.infer<typeof insertPasswordResetTokenSchema>;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;

// User invitations - for inviting team members to join
export const userInvitations = pgTable("user_invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  email: text("email").notNull(),
  fullName: text("full_name"),
  roles: text("roles").array().notNull().$type<("admin" | "board_member" | "staff" | "foster" | "volunteer")[]>(),
  token: text("token").notNull().unique(),
  invitedBy: uuid("invited_by").notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp("expires_at").notNull(),
  acceptedAt: timestamp("accepted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  uniquePendingInvite: unique().on(table.tenantId, table.email, table.acceptedAt), // Only one pending invite per email
}));

export const insertUserInvitationSchema = createInsertSchema(userInvitations).omit({
  id: true,
  createdAt: true,
  acceptedAt: true,
});
export type InsertUserInvitation = z.infer<typeof insertUserInvitationSchema>;
export type UserInvitation = typeof userInvitations.$inferSelect;

// Email events log - tracks bounces, complaints, and delivery status from Resend webhooks
export const emailEvents = pgTable("email_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(), // The email address affected
  eventType: text("event_type").notNull().$type<"bounce" | "complaint" | "delivered" | "opened" | "clicked">(),
  resendEmailId: text("resend_email_id"), // Resend's email ID
  bounceType: text("bounce_type"), // hard, soft, etc.
  reason: text("reason"), // Reason for bounce/complaint
  rawPayload: jsonb("raw_payload"), // Full webhook payload for debugging
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertEmailEventSchema = createInsertSchema(emailEvents).omit({
  id: true,
  createdAt: true,
});
export type InsertEmailEvent = z.infer<typeof insertEmailEventSchema>;
export type EmailEvent = typeof emailEvents.$inferSelect;

// Kennel Buildings table - physical buildings/areas in the facility
export const kennelBuildings = pgTable("kennel_buildings", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: text("name").notNull(), // e.g., "Main Shelter", "Quarantine Building", "Cat House"
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertKennelBuildingSchema = createInsertSchema(kennelBuildings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertKennelBuilding = z.infer<typeof insertKennelBuildingSchema>;
export type KennelBuilding = typeof kennelBuildings.$inferSelect;

// Kennel Rows table - rows of kennels within buildings
export const kennelRows = pgTable("kennel_rows", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  buildingId: uuid("building_id").notNull().references(() => kennelBuildings.id, { onDelete: 'cascade' }),
  name: text("name").notNull(), // e.g., "Row A (Large Dogs)", "Cat Condos - Upper Level"
  capacity: integer("capacity").notNull(), // Number of individual kennels in this row
  type: text("type").notNull().default("standard").$type<"standard" | "isolation" | "puppy" | "cat">(),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertKennelRowSchema = createInsertSchema(kennelRows).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertKennelRow = z.infer<typeof insertKennelRowSchema>;
export type KennelRow = typeof kennelRows.$inferSelect;

// Petfinder-compatible type values
export const PETFINDER_TYPES = ['Dog', 'Cat', 'Rabbit', 'Small & Furry', 'Horse', 'Bird', 'Scales, Fins & Other', 'Barnyard'] as const;
export type PetfinderType = typeof PETFINDER_TYPES[number];

// Petfinder-compatible age values
export const PETFINDER_AGES = ['Baby', 'Young', 'Adult', 'Senior'] as const;
export type PetfinderAge = typeof PETFINDER_AGES[number];

// Petfinder-compatible size values
export const PETFINDER_SIZES = ['Small', 'Medium', 'Large', 'Extra Large'] as const;
export type PetfinderSize = typeof PETFINDER_SIZES[number];

// Petfinder-compatible gender values
export const PETFINDER_GENDERS = ['Male', 'Female', 'Unknown'] as const;
export type PetfinderGender = typeof PETFINDER_GENDERS[number];

// Petfinder-compatible status values (for sync purposes)
export const PETFINDER_STATUSES = ['Adoptable', 'Adopted', 'Found'] as const;
export type PetfinderStatus = typeof PETFINDER_STATUSES[number];

// Animals table - adoptable animals per tenant
export const animals = pgTable("animals", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  animalId: text("animal_id").notNull().unique(), // Human-readable ID like "A12345"
  name: text("name").notNull(),
  species: text("species").notNull(), // Internal species field
  breed: text("breed").notNull(),
  age: text("age").notNull(), // Internal age field (can be free text like "2 years")
  sex: text("sex").$type<"male" | "female" | "unknown">(),
  neuterStatus: text("neuter_status").$type<"intact" | "neutered" | "spayed" | "unknown">(),
  dateOfBirth: timestamp("date_of_birth"),
  microchipNumber: text("microchip_number"),
  kennelLocation: text("kennel_location"), // Legacy text field - kept for backwards compatibility
  kennelBuildingId: uuid("kennel_building_id").references(() => kennelBuildings.id, { onDelete: 'set null' }),
  kennelRowId: uuid("kennel_row_id").references(() => kennelRows.id, { onDelete: 'set null' }),
  kennelPosition: integer("kennel_position"), // 0-based index within the row (0, 1, 2, etc.)
  medicalAlertMemo: text("medical_alert_memo"),
  photoUrls: text("photo_urls").array(),
  bio: text("bio"),
  
  // Petfinder-compatible fields (required for sync)
  petfinderType: text("petfinder_type").$type<PetfinderType>(), // Dog, Cat, Rabbit, etc.
  petfinderBreed: text("petfinder_breed"), // Must match Petfinder's official breed dictionary
  petfinderBreedSecondary: text("petfinder_breed_secondary"), // For mixed breeds
  petfinderAge: text("petfinder_age").$type<PetfinderAge>(), // Baby, Young, Adult, Senior
  petfinderSize: text("petfinder_size").$type<PetfinderSize>(), // Small, Medium, Large, Extra Large
  petfinderGender: text("petfinder_gender").$type<PetfinderGender>(), // Male, Female, Unknown
  
  // Petfinder attributes (boolean flags)
  houseTrained: boolean("house_trained"),
  declawed: boolean("declawed"), // Cats only
  specialNeeds: boolean("special_needs"),
  shotsCurrent: boolean("shots_current"),
  heartwormPositive: boolean("heartworm_positive"),
  
  // Petfinder environment compatibility
  childFriendly: boolean("child_friendly"), // Good with children
  catFriendly: boolean("cat_friendly"), // Good with cats
  dogFriendly: boolean("dog_friendly"), // Good with dogs
  needsFence: boolean("needs_fence"), // Animal requires a fenced yard for foster placement
  // Subscription limits: Only "active" statuses (available, pending, foster, medical_hold) count toward
  // subscription tier animal limits. "adopted" and "deceased" statuses do NOT count - enables unlimited historical records.
  status: text("status").notNull().default("available").$type<"available" | "pending" | "adopted" | "foster" | "medical_hold" | "deceased">(),
  intakeDate: timestamp("intake_date").notNull().defaultNow(),
  intakeSource: text("intake_source").$type<"stray" | "owner_surrender" | "transfer" | "born_in_care" | "other">(), // How the animal came to the rescue
  weight: text("weight"), // Current weight (e.g., "25 lbs", "4.2 kg")
  activityLevel: text("activity_level").$type<"low" | "moderate" | "high">(), // Energy/activity level
  dietaryRestrictions: text("dietary_restrictions"), // Special diet notes
  adoptionDate: timestamp("adoption_date"),
  deceasedDate: timestamp("deceased_date"),
  causeOfDeath: text("cause_of_death").$type<"natural_death" | "euthanasia">(),
  deceasedNotes: text("deceased_notes"),
  postedToPetfinder: boolean("posted_to_petfinder").notNull().default(false),
  petfinderUrl: text("petfinder_url"),
  petfinderSyncedAt: timestamp("petfinder_synced_at"),
  // Grant management: Success story flags
  flaggedForStory: boolean("flagged_for_story").notNull().default(false), // Flag this animal for grant narratives
  storyTags: text("story_tags").array(), // Tags like "medical", "special_needs", "senior", "parvo_survivor"
  // Behavioral Safety Rating (Traffic Light System)
  behaviorColor: text("behavior_color").$type<"green" | "yellow" | "red" | "purple">().default("green"), // Safety level - defaults to green (safe for all)
  behaviorRestrictionReason: text("behavior_restriction_reason"), // Required for yellow/red ratings
  // Canva flyer designs
  flyerUrls: text("flyer_urls").array(), // URLs of designed flyers (from Canva or manual uploads)
  canvaDesignId: text("canva_design_id"), // Canva design ID to allow editing existing flyer
  // Medical fund tracking (via Stripe donations)
  medicalFundGoal: decimal("medical_fund_goal", { precision: 10, scale: 2 }), // Target fundraising amount
  medicalFundRaised: decimal("medical_fund_raised", { precision: 10, scale: 2 }).default("0.00"), // Amount raised via donations
  // External platform import tracking (for RescueGroups, Petfinder imports, etc.)
  externalId: text("external_id"), // External platform's animal ID (prevents duplicate imports)
  externalSource: text("external_source").$type<"rescuegroups" | "petfinder" | "adoptapet" | "other">(), // Which platform imported from
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAnimalSchema = createInsertSchema(animals).omit({
  id: true,
  animalId: true, // Auto-generated on backend
  createdAt: true,
  updatedAt: true,
});
export type InsertAnimal = z.infer<typeof insertAnimalSchema>;
export type Animal = typeof animals.$inferSelect;

// Animal Notes table - staff notes about animals
export const animalNotes = pgTable("animal_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  animalId: uuid("animal_id").notNull().references(() => animals.id, { onDelete: 'cascade' }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  noteText: text("note_text").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAnimalNoteSchema = createInsertSchema(animalNotes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAnimalNote = z.infer<typeof insertAnimalNoteSchema>;
export type AnimalNote = typeof animalNotes.$inferSelect;

// Kennels table - predefined kennel locations for onsite animals
export const kennels = pgTable("kennels", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: text("name").notNull(), // e.g., "Building A, Kennel 12"
  rowLabel: text("row_label"), // Optional: Row identifier (e.g., "A", "B", "1", "2")
  kennelNumber: text("kennel_number"), // Optional: Kennel number within row (e.g., "1", "2", "3A")
  gridRow: integer("grid_row"), // Optional: Row position in visual grid layout
  gridColumn: integer("grid_column"), // Optional: Column position in visual grid layout
  displayOrder: integer("display_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertKennelSchema = createInsertSchema(kennels).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertKennel = z.infer<typeof insertKennelSchema>;
export type Kennel = typeof kennels.$inferSelect;

// Medical Bills table - billing records for animal medical expenses
export const medicalBills = pgTable("medical_bills", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  animalId: uuid("animal_id").notNull().references(() => animals.id, { onDelete: 'cascade' }),
  billDate: timestamp("bill_date").notNull(),
  vendor: text("vendor").notNull(), // Veterinary clinic or provider name
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(), // Bill amount
  description: text("description").notNull(), // What the bill was for
  invoiceNumber: text("invoice_number"), // Optional invoice/receipt number
  paymentStatus: text("payment_status").notNull().default("unpaid").$type<"unpaid" | "paid" | "partially_paid" | "insurance_pending">(),
  paidAmount: numeric("paid_amount", { precision: 10, scale: 2 }).default("0"), // Amount paid so far
  notes: text("notes"), // Additional notes about the bill
  grantId: uuid("grant_id").references(() => grants.id, { onDelete: 'set null' }), // Tag medical expense to specific grant
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertMedicalBillSchema = createInsertSchema(medicalBills).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertMedicalBill = z.infer<typeof insertMedicalBillSchema>;
export type MedicalBill = typeof medicalBills.$inferSelect;

// Adoption Form Fields table - custom form fields per tenant
export const adoptionFormFields = pgTable("adoption_form_fields", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  label: text("label").notNull(), // Question label (e.g., "Do you have a fenced yard?")
  fieldType: text("field_type").notNull().$type<"text" | "textarea" | "select" | "radio" | "checkbox" | "photo">(),
  options: text("options").array(), // For select/radio/checkbox - array of options
  required: boolean("required").notNull().default(false),
  placeholder: text("placeholder"), // Placeholder text for input fields
  helpText: text("help_text"), // Additional help text
  textAbove: text("text_above"), // Custom text displayed above this question
  textBelow: text("text_below"), // Custom text displayed below this question
  order: integer("order").notNull().default(0), // Display order
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAdoptionFormFieldSchema = createInsertSchema(adoptionFormFields).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAdoptionFormField = z.infer<typeof insertAdoptionFormFieldSchema>;
export type AdoptionFormField = typeof adoptionFormFields.$inferSelect;

// Volunteer Form Fields table - custom form fields per tenant
export const volunteerFormFields = pgTable("volunteer_form_fields", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  label: text("label").notNull(),
  fieldType: text("field_type").notNull().$type<"text" | "textarea" | "select" | "radio" | "checkbox" | "photo">(),
  options: text("options").array(),
  required: boolean("required").notNull().default(false),
  placeholder: text("placeholder"),
  helpText: text("help_text"),
  textAbove: text("text_above"), // Custom text displayed above this question
  textBelow: text("text_below"), // Custom text displayed below this question
  order: integer("order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertVolunteerFormFieldSchema = createInsertSchema(volunteerFormFields).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertVolunteerFormField = z.infer<typeof insertVolunteerFormFieldSchema>;
export type VolunteerFormField = typeof volunteerFormFields.$inferSelect;

// Foster Form Fields table - custom form fields per tenant
export const fosterFormFields = pgTable("foster_form_fields", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  label: text("label").notNull(),
  fieldType: text("field_type").notNull().$type<"text" | "textarea" | "select" | "radio" | "checkbox" | "photo">(),
  options: text("options").array(),
  required: boolean("required").notNull().default(false),
  placeholder: text("placeholder"),
  helpText: text("help_text"),
  textAbove: text("text_above"), // Custom text displayed above this question
  textBelow: text("text_below"), // Custom text displayed below this question
  order: integer("order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertFosterFormFieldSchema = createInsertSchema(fosterFormFields).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertFosterFormField = z.infer<typeof insertFosterFormFieldSchema>;
export type FosterFormField = typeof fosterFormFields.$inferSelect;

// Surrender Form Fields table - custom form fields per tenant
export const surrenderFormFields = pgTable("surrender_form_fields", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  label: text("label").notNull(),
  fieldType: text("field_type").notNull().$type<"text" | "textarea" | "select" | "radio" | "checkbox" | "photo">(),
  options: text("options").array(),
  required: boolean("required").notNull().default(false),
  placeholder: text("placeholder"),
  helpText: text("help_text"),
  textAbove: text("text_above"), // Custom text displayed above this question
  textBelow: text("text_below"), // Custom text displayed below this question
  order: integer("order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSurrenderFormFieldSchema = createInsertSchema(surrenderFormFields).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSurrenderFormField = z.infer<typeof insertSurrenderFormFieldSchema>;
export type SurrenderFormField = typeof surrenderFormFields.$inferSelect;

// Form Settings table - stores intro text and other form-level settings per tenant
export const formSettings = pgTable("form_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  formType: text("form_type").notNull().$type<"adoption" | "volunteer" | "foster" | "surrender">(),
  introText: text("intro_text"), // Text displayed at the top of the form
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  uniqueTenantForm: unique().on(table.tenantId, table.formType),
}));

export const insertFormSettingSchema = createInsertSchema(formSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertFormSetting = z.infer<typeof insertFormSettingSchema>;
export type FormSetting = typeof formSettings.$inferSelect;

// Applications table - adoption applications per tenant
export const applications = pgTable("applications", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  animalId: uuid("animal_id").notNull().references(() => animals.id, { onDelete: 'cascade' }),
  applicantName: text("applicant_name").notNull(),
  applicantEmail: text("applicant_email").notNull(),
  applicantPhone: text("applicant_phone").notNull(),
  stage: text("stage").notNull().default("new").$type<"new" | "screening" | "vet_check" | "home_visit" | "approved" | "denied" | "adopted">(),
  notes: text("notes"),
  customResponses: jsonb("custom_responses").$type<Record<string, any>>(), // Stores answers to custom form fields
  gclid: text("gclid"), // Google Click ID for Google Ads conversion tracking
  gclidCapturedAt: timestamp("gclid_captured_at"), // When the gclid was captured
  conversionSentToGoogle: boolean("conversion_sent_to_google").notNull().default(false), // Whether conversion was uploaded to Google Ads
  conversionSentAt: timestamp("conversion_sent_at"), // When conversion was sent
  // Adoption fee tracking
  adoptionFeeStatus: text("adoption_fee_status").notNull().default("pending").$type<"pending" | "paid" | "waived">(),
  adoptionFeeAmount: numeric("adoption_fee_amount", { precision: 10, scale: 2 }), // Amount paid
  adoptionFeePaidAt: timestamp("adoption_fee_paid_at"), // When the fee was paid
  adoptionFeePaymentSource: text("adoption_fee_payment_source").$type<"stripe" | "cash" | "check" | "other">(), // Payment method
  adoptionFeeTransactionId: text("adoption_fee_transaction_id"), // External transaction ID from payment processor
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertApplicationSchema = createInsertSchema(applications).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertApplication = z.infer<typeof insertApplicationSchema>;
export type Application = typeof applications.$inferSelect;

// Application with joined animal data (returned by API)
export type ApplicationWithAnimal = Application & {
  animalName?: string;
};

// Donations table - donations per tenant (supports cash and in-kind for IRS compliance)
export const donations = pgTable("donations", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  donorId: uuid("donor_id").references(() => donors.id, { onDelete: 'set null' }),
  donorName: text("donor_name").notNull(),
  donorEmail: text("donor_email").notNull(),
  donorAddress: text("donor_address"), // For receipt mailing
  donationType: text("donation_type").notNull().default("cash").$type<"cash" | "in_kind">(),
  amount: integer("amount"), // Amount in cents (e.g., $10.00 = 1000). Required for cash, ignored for in-kind
  description: text("description"), // Required for in-kind (e.g., "5 bags of dog food")
  message: text("message"),
  sponsoredAnimalId: uuid("sponsored_animal_id").references(() => animals.id),
  source: text("source").notNull().default("manual").$type<"manual" | "online_form" | "quickbooks_import" | "stripe">(),
  receiptNumber: text("receipt_number"), // Unique receipt ID for IRS compliance
  receiptSentAt: timestamp("receipt_sent_at"), // When tax receipt was emailed
  // Recurring donation tracking
  isRecurring: boolean("is_recurring").notNull().default(false), // Whether this is part of a recurring donation
  recurringFrequency: text("recurring_frequency").$type<"monthly" | "quarterly" | "yearly">(), // Frequency if recurring
  externalSubscriptionId: text("external_subscription_id"), // External subscription ID (e.g., Stripe subscription ID)
  recurringStatus: text("recurring_status").$type<"active" | "paused" | "cancelled">(), // Status of recurring subscription
  date: timestamp("date").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertDonationSchema = createInsertSchema(donations).omit({
  id: true,
  createdAt: true,
});
export type InsertDonation = z.infer<typeof insertDonationSchema>;
export type Donation = typeof donations.$inferSelect;

// Donors table - people who make donations (separate from users who are staff)
export const donors = pgTable("donors", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  stripeCustomerId: text("stripe_customer_id"), // Stripe customer ID for this donor
  email: text("email").notNull(),
  name: text("name").notNull(),
  phone: text("phone"),
  totalDonated: integer("total_donated").notNull().default(0), // Total lifetime donations in cents
  lastDonationDate: timestamp("last_donation_date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  uniqueStripeCustomer: unique().on(table.tenantId, table.stripeCustomerId),
  uniqueEmail: unique().on(table.tenantId, table.email),
}));

export const insertDonorSchema = createInsertSchema(donors).omit({
  id: true,
  createdAt: true,
});
export type InsertDonor = z.infer<typeof insertDonorSchema>;
export type Donor = typeof donors.$inferSelect;

// Payments table - all payment transactions (one-time and subscription payments)
export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  donorId: uuid("donor_id").references(() => donors.id, { onDelete: 'set null' }),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  stripeCheckoutSessionId: text("stripe_checkout_session_id"), // For ACH async payment tracking
  stripeInvoiceId: text("stripe_invoice_id"), // For subscription payments
  subscriptionId: uuid("subscription_id").references(() => subscriptions.id, { onDelete: 'set null' }),
  amount: integer("amount").notNull(), // Amount in cents
  currency: text("currency").notNull().default("usd"),
  status: text("status").notNull().$type<"pending" | "succeeded" | "failed" | "refunded">(),
  paymentMethod: text("payment_method").$type<"stripe" | "manual">(),
  isRecurring: boolean("is_recurring").notNull().default(false),
  message: text("message"), // Optional donor message
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPaymentSchema = createInsertSchema(payments).omit({
  id: true,
  createdAt: true,
});
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof payments.$inferSelect;

// Subscriptions table - recurring donation subscriptions
export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  donorId: uuid("donor_id").notNull().references(() => donors.id, { onDelete: 'cascade' }),
  stripeSubscriptionId: text("stripe_subscription_id").notNull(),
  stripePriceId: text("stripe_price_id"), // Stripe price ID for the plan
  amount: integer("amount").notNull(), // Monthly amount in cents
  currency: text("currency").notNull().default("usd"),
  interval: text("interval").notNull().default("month").$type<"month" | "year">(),
  status: text("status").notNull().$type<"active" | "canceled" | "past_due" | "incomplete">(),
  currentPeriodStart: timestamp("current_period_start"),
  currentPeriodEnd: timestamp("current_period_end"),
  canceledAt: timestamp("canceled_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  uniqueStripeSubscription: unique().on(table.tenantId, table.stripeSubscriptionId),
}));

export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({
  id: true,
  createdAt: true,
});
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Subscription = typeof subscriptions.$inferSelect;

// Expenditures table - expenses per tenant
export const expenditures = pgTable("expenditures", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  vendor: text("vendor").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(), // Store amounts as decimal (dollars with cents)
  category: text("category").notNull().$type<"vet" | "food" | "supplies" | "admin" | "transport" | "other">(),
  date: timestamp("date").notNull().defaultNow(),
  notes: text("notes"),
  grantId: uuid("grant_id").references(() => grants.id, { onDelete: 'set null' }), // Tag expense to specific grant
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertExpenditureSchema = createInsertSchema(expenditures).omit({
  id: true,
  createdAt: true,
});
export type InsertExpenditure = z.infer<typeof insertExpenditureSchema>;
export type Expenditure = typeof expenditures.$inferSelect;

// Volunteer opportunities table
export const volunteerOpportunities = pgTable("volunteer_opportunities", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  title: text("title").notNull(),
  description: text("description").notNull(),
  date: text("date").notNull(),
  time: text("time").notNull(),
  location: text("location").notNull(),
  slotsTotal: integer("slots_total").notNull(),
  slotsFilled: integer("slots_filled").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertVolunteerOpportunitySchema = createInsertSchema(volunteerOpportunities).omit({
  id: true,
  createdAt: true,
  slotsFilled: true,
});
export type InsertVolunteerOpportunity = z.infer<typeof insertVolunteerOpportunitySchema>;
export type VolunteerOpportunity = typeof volunteerOpportunities.$inferSelect;

// Volunteer signups table - tracks which users signed up for which opportunities
export const volunteerSignups = pgTable("volunteer_signups", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  opportunityId: uuid("opportunity_id").notNull().references(() => volunteerOpportunities.id, { onDelete: 'cascade' }),
  userId: uuid("user_id").references(() => users.id, { onDelete: 'cascade' }), // Optional - for logged-in users
  applicantName: text("applicant_name").notNull(),
  applicantEmail: text("applicant_email").notNull(),
  applicantPhone: text("applicant_phone").notNull(),
  customResponses: jsonb("custom_responses").$type<Record<string, any>>(), // Stores answers to custom form fields
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  uniqueSignup: unique().on(table.opportunityId, table.applicantEmail),
}));

export const insertVolunteerSignupSchema = createInsertSchema(volunteerSignups).omit({
  id: true,
  tenantId: true,
  createdAt: true,
});
export type InsertVolunteerSignup = z.infer<typeof insertVolunteerSignupSchema>;
export type VolunteerSignup = typeof volunteerSignups.$inferSelect;

// Volunteer applications table - public applications to become a volunteer
export const volunteerApplications = pgTable("volunteer_applications", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  applicantName: text("applicant_name").notNull(),
  applicantEmail: text("applicant_email").notNull(),
  applicantPhone: text("applicant_phone").notNull(),
  address: text("address"),
  experience: text("experience").notNull(),
  availability: text("availability").notNull(),
  interests: text("interests"),
  skills: text("skills"),
  emergencyContactName: text("emergency_contact_name"),
  emergencyContactPhone: text("emergency_contact_phone"),
  status: text("status").notNull().default("pending").$type<"pending" | "approved" | "rejected">(),
  notes: text("notes"),
  customResponses: jsonb("custom_responses").$type<Record<string, any>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertVolunteerApplicationSchema = createInsertSchema(volunteerApplications).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertVolunteerApplication = z.infer<typeof insertVolunteerApplicationSchema>;
export type VolunteerApplication = typeof volunteerApplications.$inferSelect;

// Foster applications table - public applications to become a foster
export const fosterApplications = pgTable("foster_applications", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  applicantName: text("applicant_name").notNull(),
  applicantEmail: text("applicant_email").notNull(),
  applicantPhone: text("applicant_phone").notNull(),
  address: text("address").notNull(),
  housingType: text("housing_type").notNull().$type<"house" | "apartment" | "condo" | "other">(),
  hasYard: boolean("has_yard").notNull().default(false),
  hasOtherPets: boolean("has_other_pets").notNull().default(false),
  otherPetsDetails: text("other_pets_details"),
  experience: text("experience").notNull(),
  availability: text("availability").notNull(),
  preferences: text("preferences"),
  vetReference: text("vet_reference"),
  personalReference: text("personal_reference"),
  status: text("status").notNull().default("pending").$type<"pending" | "approved" | "rejected">(),
  notes: text("notes"), // Admin notes
  customResponses: jsonb("custom_responses").$type<Record<string, any>>(), // Stores answers to custom form fields
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertFosterApplicationSchema = createInsertSchema(fosterApplications).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertFosterApplication = z.infer<typeof insertFosterApplicationSchema>;
export type FosterApplication = typeof fosterApplications.$inferSelect;

// Animal surrenders table - public requests to surrender an animal to the rescue
export const animalSurrenders = pgTable("animal_surrenders", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  submitterName: text("submitter_name").notNull(),
  submitterEmail: text("submitter_email").notNull(),
  submitterPhone: text("submitter_phone").notNull(),
  address: text("address").notNull(),
  animalName: text("animal_name").notNull(),
  species: text("species").notNull(),
  breed: text("breed").notNull(),
  age: text("age").notNull(),
  sex: text("sex").notNull().$type<"male" | "female" | "unknown">(),
  spayedNeutered: boolean("spayed_neutered").notNull().default(false),
  medicalHistory: text("medical_history").notNull(),
  behaviorNotes: text("behavior_notes").notNull(),
  reasonForSurrender: text("reason_for_surrender").notNull(),
  isEmergency: boolean("is_emergency").notNull().default(false),
  status: text("status").notNull().default("pending").$type<"pending" | "approved" | "rejected" | "completed">(),
  notes: text("notes"),
  customResponses: jsonb("custom_responses").$type<Record<string, any>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAnimalSurrenderSchema = createInsertSchema(animalSurrenders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAnimalSurrender = z.infer<typeof insertAnimalSurrenderSchema>;
export type AnimalSurrender = typeof animalSurrenders.$inferSelect;

// Foster animals table - animals currently in foster care
export const fosterAnimals = pgTable("foster_animals", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  animalId: uuid("animal_id").notNull().references(() => animals.id, { onDelete: 'cascade' }),
  fosterId: uuid("foster_id").notNull().references(() => users.id, { onDelete: 'cascade' }), // User with role="foster"
  startDate: timestamp("start_date").notNull().defaultNow(),
  expectedReturnDate: timestamp("expected_return_date"),
  actualReturnDate: timestamp("actual_return_date"),
  status: text("status").notNull().default("active").$type<"active" | "completed" | "returned">(),
  notes: text("notes"), // Care notes, medical info, behavioral notes
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertFosterAnimalSchema = createInsertSchema(fosterAnimals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertFosterAnimal = z.infer<typeof insertFosterAnimalSchema>;
export type FosterAnimal = typeof fosterAnimals.$inferSelect;

// Adoptions table - tracks completed adoptions
export const adoptions = pgTable("adoptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  animalId: uuid("animal_id").notNull().references(() => animals.id, { onDelete: 'cascade' }),
  applicationId: uuid("application_id").references(() => applications.id, { onDelete: 'set null' }), // Optional link to application
  adopterName: text("adopter_name").notNull(),
  adopterEmail: text("adopter_email").notNull(),
  adopterPhone: text("adopter_phone").notNull(),
  adoptionDate: timestamp("adoption_date").notNull().defaultNow(),
  adoptionFee: numeric("adoption_fee", { precision: 10, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAdoptionSchema = createInsertSchema(adoptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  adoptionDate: z.union([z.date(), z.string()]).transform(val => 
    typeof val === 'string' ? new Date(val) : val
  ).optional(),
});
export type InsertAdoption = z.infer<typeof insertAdoptionSchema>;
export type Adoption = typeof adoptions.$inferSelect;

// Foster requests table - supply and medical requests from fosters
export const fosterRequests = pgTable("foster_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  requestType: text("request_type").notNull().$type<"supply" | "medical">(),
  // Supply request fields
  item: text("item"),
  quantity: text("quantity"),
  // Medical request fields
  animalName: text("animal_name"),
  symptoms: text("symptoms"),
  urgency: text("urgency").$type<"low" | "medium" | "high" | "emergency">(),
  description: text("description"),
  notes: text("notes"),
  status: text("status").notNull().default("pending").$type<"pending" | "approved" | "fulfilled" | "denied">(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertFosterRequestSchema = createInsertSchema(fosterRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertFosterRequest = z.infer<typeof insertFosterRequestSchema>;
export type FosterRequest = typeof fosterRequests.$inferSelect;

// Contacts table - comprehensive directory of all contacts (donors, adopters, fosters, users, etc.)
export const contacts = pgTable("contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  userId: uuid("user_id").references(() => users.id, { onDelete: 'set null' }), // Link to user account if applicable
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  address: text("address"),
  // Source tracking - where did this contact come from
  source: text("source").array().notNull().default(sql`ARRAY[]::text[]`).$type<("adoption_application" | "foster_application" | "volunteer_application" | "user" | "donation" | "manual" | "newsletter")[]>(),
  // Role information if they're a user
  role: text("role").array().$type<("admin" | "board_member" | "staff" | "foster" | "volunteer")[]>(),
  // Donation tracking
  totalDonated: integer("total_donated").notNull().default(0),
  donationCount: integer("donation_count").notNull().default(0),
  lastDonationDate: timestamp("last_donation_date"),
  // Additional info
  tags: text("tags").array().default(sql`ARRAY[]::text[]`), // Custom categorization
  notes: text("notes"), // Admin notes
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  uniqueEmail: unique().on(table.tenantId, table.email),
}));

export const insertContactSchema = createInsertSchema(contacts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertContact = z.infer<typeof insertContactSchema>;
export type Contact = typeof contacts.$inferSelect;

// Happy tails table - success stories
export const happyTails = pgTable("happy_tails", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  animalId: uuid("animal_id").references(() => animals.id, { onDelete: 'set null' }),
  animalName: text("animal_name").notNull(),
  adopterName: text("adopter_name").notNull(),
  story: text("story").notNull(),
  photoUrl: text("photo_url"),
  date: text("date").notNull(),
  isPublished: boolean("is_published").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertHappyTailSchema = createInsertSchema(happyTails).omit({
  id: true,
  createdAt: true,
});
export type InsertHappyTail = z.infer<typeof insertHappyTailSchema>;
export type HappyTail = typeof happyTails.$inferSelect;

// Update schema for PATCH requests - excludes protected fields
export const updateHappyTailSchema = insertHappyTailSchema.omit({
  tenantId: true,
}).partial();
export type UpdateHappyTail = z.infer<typeof updateHappyTailSchema>;

// Newsletter subscribers table - email newsletter opt-ins
export const newsletterSubscribers = pgTable("newsletter_subscribers", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  email: text("email").notNull(),
  name: text("name"), // Optional
  status: text("status").notNull().default("active").$type<"active" | "unsubscribed">(),
  source: text("source").notNull().default("website").$type<"website" | "donation" | "application" | "manual">(), // How they subscribed
  unsubscribeToken: text("unsubscribe_token").notNull().unique(), // For one-click unsubscribe
  subscribedAt: timestamp("subscribed_at").notNull().defaultNow(),
  unsubscribedAt: timestamp("unsubscribed_at"),
}, (table) => ({
  uniqueEmail: unique().on(table.tenantId, table.email),
}));

export const insertNewsletterSubscriberSchema = createInsertSchema(newsletterSubscribers).omit({
  id: true,
  subscribedAt: true,
});
export type InsertNewsletterSubscriber = z.infer<typeof insertNewsletterSubscriberSchema>;
export type NewsletterSubscriber = typeof newsletterSubscribers.$inferSelect;

// Calendars table - multiple calendars per tenant
// Calendar theme settings type
export type CalendarThemeSettings = {
  headerColor?: string;
  headerTextColor?: string;
  accentColor?: string;
  headerBackgroundImageUrl?: string;
};

// Event form field configuration for customizable event creation forms
export type EventFormFieldConfig = {
  visible: boolean;
  required: boolean;
  label?: string; // Custom label override
};

export type FixedDayTime = {
  enabled: boolean;
  startTime: string; // HH:mm format (e.g., "09:00")
  endTime: string;   // HH:mm format (e.g., "17:00")
};

export type EventFormSettings = {
  // For volunteer calendars, use simplified mode where users just check a box to sign up
  simplifiedVolunteerMode?: boolean;
  // Fixed times per day of week (0=Sunday, 1=Monday, etc.)
  // When set and simplifiedVolunteerMode is true, time fields are hidden and these defaults are used
  fixedDayTimes?: {
    0?: FixedDayTime; // Sunday
    1?: FixedDayTime; // Monday
    2?: FixedDayTime; // Tuesday
    3?: FixedDayTime; // Wednesday
    4?: FixedDayTime; // Thursday
    5?: FixedDayTime; // Friday
    6?: FixedDayTime; // Saturday
  };
  // Field configurations
  title: EventFormFieldConfig;
  description: EventFormFieldConfig;
  location: EventFormFieldConfig;
  startTime: EventFormFieldConfig;
  endTime: EventFormFieldConfig;
  meetLink: EventFormFieldConfig;
  customPage: EventFormFieldConfig;
};

// Default form settings for different calendar types
export const DEFAULT_EVENT_FORM_SETTINGS: Record<string, EventFormSettings> = {
  volunteer: {
    simplifiedVolunteerMode: true,
    title: { visible: false, required: false },
    description: { visible: true, required: false, label: "Comment (optional)" },
    location: { visible: false, required: false },
    startTime: { visible: true, required: true },
    endTime: { visible: true, required: true },
    meetLink: { visible: false, required: false },
    customPage: { visible: false, required: false },
  },
  events: {
    simplifiedVolunteerMode: false,
    title: { visible: true, required: true },
    description: { visible: true, required: false },
    location: { visible: true, required: false },
    startTime: { visible: true, required: true },
    endTime: { visible: true, required: true },
    meetLink: { visible: true, required: false },
    customPage: { visible: true, required: false },
  },
  fundraising: {
    simplifiedVolunteerMode: false,
    title: { visible: true, required: true },
    description: { visible: true, required: false },
    location: { visible: true, required: false },
    startTime: { visible: true, required: true },
    endTime: { visible: true, required: true },
    meetLink: { visible: true, required: false },
    customPage: { visible: true, required: false },
  },
  vet_appointments: {
    simplifiedVolunteerMode: false,
    title: { visible: true, required: true },
    description: { visible: true, required: false },
    location: { visible: true, required: true },
    startTime: { visible: true, required: true },
    endTime: { visible: true, required: true },
    meetLink: { visible: false, required: false },
    customPage: { visible: false, required: false },
  },
  custom: {
    simplifiedVolunteerMode: false,
    title: { visible: true, required: true },
    description: { visible: true, required: false },
    location: { visible: true, required: false },
    startTime: { visible: true, required: true },
    endTime: { visible: true, required: true },
    meetLink: { visible: true, required: false },
    customPage: { visible: true, required: false },
  },
};

export const calendars = pgTable("calendars", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  description: text("description"),
  type: text("type").notNull().$type<"volunteer" | "events" | "fundraising" | "vet_appointments" | "custom">(),
  color: text("color").notNull().default("#3b82f6"), // For visual differentiation
  isActive: boolean("is_active").notNull().default(true),
  isPublic: boolean("is_public").notNull().default(false), // Whether events from this calendar are shown on public homepage
  themeSettings: jsonb("theme_settings").$type<CalendarThemeSettings>(),
  eventFormSettings: jsonb("event_form_settings").$type<EventFormSettings>(), // Customizable event creation form fields
  googleCalendarId: text("google_calendar_id"), // ID of corresponding Google Calendar when synced to tenant's Google Workspace
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCalendarSchema = createInsertSchema(calendars).omit({
  id: true,
  createdAt: true,
});
export type InsertCalendar = z.infer<typeof insertCalendarSchema>;
export type Calendar = typeof calendars.$inferSelect;

// Calendar events table - events for each calendar
export const calendarEvents = pgTable("calendar_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  calendarId: uuid("calendar_id").notNull().references(() => calendars.id, { onDelete: 'cascade' }),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  title: text("title").notNull(),
  description: text("description"),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  location: text("location"),
  customPageId: uuid("custom_page_id").references(() => customPages.id, { onDelete: 'set null' }),
  // Google Calendar sync metadata
  googleEventId: text("google_event_id"), // Google Calendar event ID
  googleCalendarId: text("google_calendar_id"), // Which Google Calendar (if multiple)
  syncStatus: text("sync_status").$type<"not_synced" | "pending" | "synced" | "error">().default("not_synced"),
  lastSyncedAt: timestamp("last_synced_at"),
  syncError: text("sync_error"), // Error message if sync failed
  // Virtual meeting integration
  includeMeetLink: boolean("include_meet_link").notNull().default(false), // Whether user requested Meet link
  virtualMeetingProvider: text("virtual_meeting_provider").$type<"google_meet" | "zoom" | "teams">(), // Future-proof for other providers
  virtualMeetingLink: text("virtual_meeting_link"), // The actual meeting URL
  // Audit fields
  createdBy: uuid("created_by").notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCalendarEventSchema = createInsertSchema(calendarEvents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCalendarEvent = z.infer<typeof insertCalendarEventSchema>;
export type CalendarEvent = typeof calendarEvents.$inferSelect;

// Calendar permissions table - who can edit which calendars (user-based)
export const calendarPermissions = pgTable("calendar_permissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  calendarId: uuid("calendar_id").notNull().references(() => calendars.id, { onDelete: 'cascade' }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  canEdit: boolean("can_edit").notNull().default(true),
  canAdd: boolean("can_add").notNull().default(true),
  canDelete: boolean("can_delete").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  uniquePermission: unique().on(table.calendarId, table.userId),
}));

export const insertCalendarPermissionSchema = createInsertSchema(calendarPermissions).omit({
  id: true,
  createdAt: true,
});
export type InsertCalendarPermission = z.infer<typeof insertCalendarPermissionSchema>;
export type CalendarPermission = typeof calendarPermissions.$inferSelect;

// Calendar role permissions table - grant access by role
export const calendarRolePermissions = pgTable("calendar_role_permissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  calendarId: uuid("calendar_id").notNull().references(() => calendars.id, { onDelete: 'cascade' }),
  role: text("role").notNull().$type<"admin" | "staff" | "board_member" | "foster" | "volunteer">(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  canEdit: boolean("can_edit").notNull().default(true),
  canAdd: boolean("can_add").notNull().default(true),
  canDelete: boolean("can_delete").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  uniqueRolePermission: unique().on(table.calendarId, table.role),
}));

export const insertCalendarRolePermissionSchema = createInsertSchema(calendarRolePermissions).omit({
  id: true,
  createdAt: true,
});
export type InsertCalendarRolePermission = z.infer<typeof insertCalendarRolePermissionSchema>;
export type CalendarRolePermission = typeof calendarRolePermissions.$inferSelect;

// Medical Exams - SOAP format clinical exams
export const medicalExams = pgTable("medical_exams", {
  id: uuid("id").primaryKey().defaultRandom(),
  animalId: uuid("animal_id").notNull().references(() => animals.id, { onDelete: 'cascade' }),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  examType: text("exam_type").notNull().$type<"intake" | "recheck" | "adoption" | "wellness" | "emergency" | "other">(),
  examDate: timestamp("exam_date").notNull(),
  performedBy: text("performed_by").notNull(),
  subjective: text("subjective"),
  objective: text("objective"),
  assessment: text("assessment"),
  plan: text("plan"),
  structuredFields: jsonb("structured_fields").$type<{
    weight?: string;
    temperature?: string;
    heartRate?: string;
    respiratoryRate?: string;
    bodyCondition?: string;
    dental?: string;
    skin?: string;
    [key: string]: string | undefined;
  }>(),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  billId: uuid("bill_id").references(() => medicalBills.id, { onDelete: 'set null' }),
  billVendor: text("bill_vendor"),
  billAmount: numeric("bill_amount", { precision: 10, scale: 2 }),
  billInvoiceNumber: text("bill_invoice_number"),
  billPaymentStatus: text("bill_payment_status"),
  billPaidAmount: numeric("bill_paid_amount", { precision: 10, scale: 2 }),
  billNotes: text("bill_notes"),
});

export const insertMedicalExamSchema = createInsertSchema(medicalExams).omit({
  id: true,
  animalId: true,
  tenantId: true,
  createdBy: true,
  createdAt: true,
}).extend({
  examDate: z.coerce.date(),
  billVendor: z.string().optional(),
  billAmount: z.string().optional(),
  billInvoiceNumber: z.string().optional(),
  billPaymentStatus: z.string().optional(),
  billPaidAmount: z.string().optional(),
  billNotes: z.string().optional(),
});
export type InsertMedicalExam = z.infer<typeof insertMedicalExamSchema>;
export type MedicalExam = typeof medicalExams.$inferSelect;

// Vaccine Records
export const vaccineRecords = pgTable("vaccine_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  animalId: uuid("animal_id").notNull().references(() => animals.id, { onDelete: 'cascade' }),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  itemName: text("item_name").notNull(),
  dateGiven: timestamp("date_given").notNull(),
  dateDue: timestamp("date_due"),
  manufacturer: text("manufacturer"),
  lotNumber: text("lot_number"),
  administeredBy: text("administered_by"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  billId: uuid("bill_id").references(() => medicalBills.id, { onDelete: 'set null' }),
  billVendor: text("bill_vendor"),
  billAmount: numeric("bill_amount", { precision: 10, scale: 2 }),
  billInvoiceNumber: text("bill_invoice_number"),
  billPaymentStatus: text("bill_payment_status").$type<"unpaid" | "paid" | "partially_paid" | "insurance_pending">(),
  billPaidAmount: numeric("bill_paid_amount", { precision: 10, scale: 2 }),
  billNotes: text("bill_notes"),
});

export const insertVaccineRecordSchema = createInsertSchema(vaccineRecords).omit({
  id: true,
  animalId: true,
  tenantId: true,
  createdBy: true,
  createdAt: true,
}).extend({
  dateGiven: z.coerce.date(),
  dateDue: z.union([z.coerce.date(), z.literal(""), z.null(), z.undefined()]).optional().transform((val) => (val === "" || val === null || val === undefined) ? null : val),
  billVendor: z.string().optional(),
  billAmount: z.string().optional(),
  billInvoiceNumber: z.string().optional(),
  billPaymentStatus: z.string().optional(),
  billPaidAmount: z.string().optional(),
  billNotes: z.string().optional(),
});
export type InsertVaccineRecord = z.infer<typeof insertVaccineRecordSchema>;
export type VaccineRecord = typeof vaccineRecords.$inferSelect;

// Diagnostic Tests
export const diagnosticTests = pgTable("diagnostic_tests", {
  id: uuid("id").primaryKey().defaultRandom(),
  animalId: uuid("animal_id").notNull().references(() => animals.id, { onDelete: 'cascade' }),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  testName: text("test_name").notNull(),
  testDate: timestamp("test_date").notNull(),
  result: text("result").notNull(),
  notes: text("notes"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  billId: uuid("bill_id").references(() => medicalBills.id, { onDelete: 'set null' }),
  billVendor: text("bill_vendor"),
  billAmount: numeric("bill_amount", { precision: 10, scale: 2 }),
  billInvoiceNumber: text("bill_invoice_number"),
  billPaymentStatus: text("bill_payment_status").$type<"unpaid" | "paid" | "partially_paid" | "insurance_pending">(),
  billPaidAmount: numeric("bill_paid_amount", { precision: 10, scale: 2 }),
  billNotes: text("bill_notes"),
});

export const insertDiagnosticTestSchema = createInsertSchema(diagnosticTests).omit({
  id: true,
  animalId: true,
  tenantId: true,
  createdBy: true,
  createdAt: true,
}).extend({
  testDate: z.coerce.date(),
  billVendor: z.string().optional(),
  billAmount: z.string().optional(),
  billInvoiceNumber: z.string().optional(),
  billPaymentStatus: z.string().optional(),
  billPaidAmount: z.string().optional(),
  billNotes: z.string().optional(),
});
export type InsertDiagnosticTest = z.infer<typeof insertDiagnosticTestSchema>;
export type DiagnosticTest = typeof diagnosticTests.$inferSelect;

// Procedure Logs
export const procedureLogs = pgTable("procedure_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  animalId: uuid("animal_id").notNull().references(() => animals.id, { onDelete: 'cascade' }),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  procedureName: text("procedure_name").notNull(),
  procedureDate: timestamp("procedure_date").notNull(),
  veterinarian: text("veterinarian"),
  notes: text("notes"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  billId: uuid("bill_id").references(() => medicalBills.id, { onDelete: 'set null' }),
  billVendor: text("bill_vendor"),
  billAmount: numeric("bill_amount", { precision: 10, scale: 2 }),
  billInvoiceNumber: text("bill_invoice_number"),
  billPaymentStatus: text("bill_payment_status").$type<"unpaid" | "paid" | "partially_paid" | "insurance_pending">(),
  billPaidAmount: numeric("bill_paid_amount", { precision: 10, scale: 2 }),
  billNotes: text("bill_notes"),
});

export const insertProcedureLogSchema = createInsertSchema(procedureLogs).omit({
  id: true,
  animalId: true,
  tenantId: true,
  createdBy: true,
  createdAt: true,
}).extend({
  procedureDate: z.coerce.date(),
  billVendor: z.string().optional(),
  billAmount: z.string().optional(),
  billInvoiceNumber: z.string().optional(),
  billPaymentStatus: z.string().optional(),
  billPaidAmount: z.string().optional(),
  billNotes: z.string().optional(),
});
export type InsertProcedureLog = z.infer<typeof insertProcedureLogSchema>;
export type ProcedureLog = typeof procedureLogs.$inferSelect;

// Medical Prescriptions - parent of doses
export const medicalPrescriptions = pgTable("medical_prescriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  animalId: uuid("animal_id").notNull().references(() => animals.id, { onDelete: 'cascade' }),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  medicationName: text("medication_name").notNull(),
  dosage: text("dosage").notNull(),
  route: text("route").notNull().$type<"PO" | "SQ" | "IM" | "IV" | "Topical" | "Other">(),
  frequency: text("frequency").notNull(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date"),
  notes: text("notes"),
  isControlledSubstance: boolean("is_controlled_substance").notNull().default(false),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  billId: uuid("bill_id").references(() => medicalBills.id, { onDelete: 'set null' }),
  billVendor: text("bill_vendor"),
  billAmount: numeric("bill_amount", { precision: 10, scale: 2 }),
  billInvoiceNumber: text("bill_invoice_number"),
  billPaymentStatus: text("bill_payment_status").$type<"unpaid" | "paid" | "partially_paid" | "insurance_pending">(),
  billPaidAmount: numeric("bill_paid_amount", { precision: 10, scale: 2 }),
  billNotes: text("bill_notes"),
  grantId: uuid("grant_id").references(() => grants.id, { onDelete: 'set null' }), // Tag medication expense to specific grant
});

export const insertMedicalPrescriptionSchema = createInsertSchema(medicalPrescriptions).omit({
  id: true,
  animalId: true,
  tenantId: true,
  createdBy: true,
  createdAt: true,
}).extend({
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
});
export type InsertMedicalPrescription = z.infer<typeof insertMedicalPrescriptionSchema>;
export type MedicalPrescription = typeof medicalPrescriptions.$inferSelect;

// Medical Doses - child of prescriptions
export const medicalDoses = pgTable("medical_doses", {
  id: uuid("id").primaryKey().defaultRandom(),
  prescriptionId: uuid("prescription_id").notNull().references(() => medicalPrescriptions.id, { onDelete: 'cascade' }),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  dueDate: timestamp("due_date").notNull(),
  status: text("status").notNull().default("due").$type<"due" | "given" | "skipped" | "missed" | "unable">(),
  givenAt: timestamp("given_at"),
  administeredBy: uuid("administered_by").references(() => users.id),
  notes: text("notes"),
  unableReason: text("unable_reason").$type<"animal_sick" | "unable_to_swallow" | "other">(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertMedicalDoseSchema = createInsertSchema(medicalDoses).omit({
  id: true,
  createdAt: true,
});
export type InsertMedicalDose = z.infer<typeof insertMedicalDoseSchema>;
export type MedicalDose = typeof medicalDoses.$inferSelect;

// Medical Files - documents and images
export const medicalFiles = pgTable("medical_files", {
  id: uuid("id").primaryKey().defaultRandom(),
  animalId: uuid("animal_id").notNull().references(() => animals.id, { onDelete: 'cascade' }),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(),
  mimeType: text("mime_type"),
  fileSize: integer("file_size"),
  description: text("description"),
  uploadedBy: uuid("uploaded_by").references(() => users.id),
  uploadDate: timestamp("upload_date").notNull().defaultNow(),
});

export const insertMedicalFileSchema = createInsertSchema(medicalFiles).omit({
  id: true,
  uploadDate: true,
});
export type InsertMedicalFile = z.infer<typeof insertMedicalFileSchema>;
export type MedicalFile = typeof medicalFiles.$inferSelect;

// Animal Drive Files - Google Drive file attachments
export const animalDriveFiles = pgTable("animal_drive_files", {
  id: uuid("id").primaryKey().defaultRandom(),
  animalId: uuid("animal_id").notNull().references(() => animals.id, { onDelete: 'cascade' }),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  driveFileId: text("drive_file_id").notNull(),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(),
  mimeType: text("mime_type"),
  iconLink: text("icon_link"),
  attachedBy: uuid("attached_by").references(() => users.id),
  attachedAt: timestamp("attached_at").notNull().defaultNow(),
});

export const insertAnimalDriveFileSchema = createInsertSchema(animalDriveFiles).omit({
  id: true,
  attachedAt: true,
});
export type InsertAnimalDriveFile = z.infer<typeof insertAnimalDriveFileSchema>;
export type AnimalDriveFile = typeof animalDriveFiles.$inferSelect;

// Medical Record Permissions - user-specific permissions per animal
export const medicalRecordPermissions = pgTable("medical_record_permissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  animalId: uuid("animal_id").notNull().references(() => animals.id, { onDelete: 'cascade' }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  canEdit: boolean("can_edit").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  uniquePermission: unique().on(table.animalId, table.userId),
}));

export const insertMedicalRecordPermissionSchema = createInsertSchema(medicalRecordPermissions).omit({
  id: true,
  createdAt: true,
});
export type InsertMedicalRecordPermission = z.infer<typeof insertMedicalRecordPermissionSchema>;
export type MedicalRecordPermission = typeof medicalRecordPermissions.$inferSelect;

// Medical Record Role Permissions - role-based permissions per animal
export const medicalRecordRolePermissions = pgTable("medical_record_role_permissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  animalId: uuid("animal_id").notNull().references(() => animals.id, { onDelete: 'cascade' }),
  role: text("role").notNull().$type<"admin" | "staff" | "board_member" | "foster" | "volunteer">(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  canEdit: boolean("can_edit").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  uniqueRolePermission: unique().on(table.animalId, table.role),
}));

export const insertMedicalRecordRolePermissionSchema = createInsertSchema(medicalRecordRolePermissions).omit({
  id: true,
  createdAt: true,
});
export type InsertMedicalRecordRolePermission = z.infer<typeof insertMedicalRecordRolePermissionSchema>;
export type MedicalRecordRolePermission = typeof medicalRecordRolePermissions.$inferSelect;

// Global Medical Record Role Permissions - role-based permissions that apply to ALL animals
export const globalMedicalRecordRolePermissions = pgTable("global_medical_record_role_permissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  role: text("role").notNull().$type<"admin" | "staff" | "board_member" | "foster" | "volunteer">(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  canView: boolean("can_view").notNull().default(true),
  canEdit: boolean("can_edit").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  uniqueGlobalRolePermission: unique().on(table.tenantId, table.role),
}));

export const insertGlobalMedicalRecordRolePermissionSchema = createInsertSchema(globalMedicalRecordRolePermissions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertGlobalMedicalRecordRolePermission = z.infer<typeof insertGlobalMedicalRecordRolePermissionSchema>;
export type GlobalMedicalRecordRolePermission = typeof globalMedicalRecordRolePermissions.$inferSelect;

// Controlled Substance Log - immutable DEA-compliant logging
export const controlledSubstanceLog = pgTable("controlled_substance_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  entryDate: timestamp("entry_date").notNull().defaultNow(),
  drugName: text("drug_name").notNull(),
  bottleId: text("bottle_id").notNull(),
  animalId: uuid("animal_id").references(() => animals.id),
  prescriptionId: uuid("prescription_id").references(() => medicalPrescriptions.id),
  amountUsed: numeric("amount_used", { precision: 10, scale: 2 }).notNull().default("0"),
  amountWasted: numeric("amount_wasted", { precision: 10, scale: 2 }).notNull().default("0"),
  remainingBalance: numeric("remaining_balance", { precision: 10, scale: 2 }).notNull(),
  administeredBy: uuid("administered_by").notNull().references(() => users.id),
  witnessedBy: uuid("witnessed_by").references(() => users.id),
  notes: text("notes"),
  correctionOf: uuid("correction_of"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertControlledSubstanceLogSchema = createInsertSchema(controlledSubstanceLog).omit({
  id: true,
  createdAt: true,
});
export type InsertControlledSubstanceLog = z.infer<typeof insertControlledSubstanceLogSchema>;
export type ControlledSubstanceLog = typeof controlledSubstanceLog.$inferSelect;

// Supply Requests - structured supply requests from fosters
export const supplyRequests = pgTable("supply_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  fosterId: uuid("foster_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  animalId: uuid("animal_id").references(() => animals.id, { onDelete: 'set null' }),
  category: text("category").notNull().$type<"food" | "medication" | "supplies" | "other">(),
  item: text("item").notNull(),
  quantity: text("quantity").notNull(),
  notes: text("notes"),
  status: text("status").notNull().default("pending").$type<"pending" | "approved" | "fulfilled" | "denied">(),
  archivedAt: timestamp("archived_at"), // Auto-set to 7 days after fulfilled/denied
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSupplyRequestSchema = createInsertSchema(supplyRequests).omit({
  id: true,
  tenantId: true,
  fosterId: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSupplyRequest = z.infer<typeof insertSupplyRequestSchema>;
export type SupplyRequest = typeof supplyRequests.$inferSelect;

// Foster Updates - updates and concerns from fosters
export const fosterUpdates = pgTable("foster_updates", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  fosterId: uuid("foster_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  animalId: uuid("animal_id").notNull().references(() => animals.id, { onDelete: 'cascade' }),
  updateType: text("update_type").notNull().$type<"medical_concern" | "behavioral_note" | "general_update" | "photo_update">(),
  description: text("description").notNull(),
  photoUrls: text("photo_urls").array(),
  priority: text("priority").notNull().default("normal").$type<"low" | "normal" | "high" | "urgent">(),
  status: text("status").notNull().default("pending").$type<"pending" | "acknowledged" | "resolved">(),
  archivedAt: timestamp("archived_at"), // Auto-set to 7 days after resolved
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertFosterUpdateSchema = createInsertSchema(fosterUpdates).omit({
  id: true,
  tenantId: true,
  fosterId: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertFosterUpdate = z.infer<typeof insertFosterUpdateSchema>;
export type FosterUpdate = typeof fosterUpdates.$inferSelect;

// Tasks - general task management system
export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  title: text("title").notNull(),
  description: text("description"),
  taskType: text("task_type").notNull().$type<"supply_request" | "medical_concern" | "behavioral_note" | "general" | "admin">(),
  assignedTo: text("assigned_to").notNull().$type<"foster_coordinator" | "medical_team" | "adoption_coordinator" | "admin">(),
  assignedUserId: uuid("assigned_user_id").references(() => users.id, { onDelete: 'set null' }),
  priority: text("priority").notNull().default("normal").$type<"low" | "normal" | "high" | "urgent">(),
  status: text("status").notNull().default("pending").$type<"pending" | "in_progress" | "completed" | "cancelled">(),
  relatedAnimalId: uuid("related_animal_id").references(() => animals.id, { onDelete: 'set null' }),
  relatedSupplyRequestId: uuid("related_supply_request_id").references(() => supplyRequests.id, { onDelete: 'set null' }),
  relatedFosterUpdateId: uuid("related_foster_update_id").references(() => fosterUpdates.id, { onDelete: 'set null' }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: 'set null' }),
  completedAt: timestamp("completed_at"),
  completedBy: uuid("completed_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertTaskSchema = createInsertSchema(tasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasks.$inferSelect;

// Rescue Contacts - who to contact for what
export const rescueContacts = pgTable("rescue_contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  contactType: text("contact_type").notNull().$type<"medical_emergency" | "supplies" | "adoption_questions" | "foster_coordinator" | "general" | "after_hours">(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  phone: text("phone"),
  email: text("email"),
  availability: text("availability"), // e.g., "Monday-Friday 9am-5pm", "24/7 Emergency"
  notes: text("notes"),
  displayOrder: integer("display_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertRescueContactSchema = createInsertSchema(rescueContacts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertRescueContact = z.infer<typeof insertRescueContactSchema>;
export type RescueContact = typeof rescueContacts.$inferSelect;

// Documents - organizational documentation (insurance, bylaws, policies)
export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").notNull().$type<"insurance" | "bylaws" | "policies" | "procedures" | "forms" | "other">(),
  fileUrl: text("file_url").notNull(),
  fileSize: integer("file_size").notNull(), // in bytes
  fileName: text("file_name").notNull(),
  uploadedBy: uuid("uploaded_by").notNull().references(() => users.id, { onDelete: 'cascade' }),
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  storageType: text("storage_type").$type<"google_drive" | "replit_object_storage">(),
  driveFileId: text("drive_file_id"),
});

export const insertDocumentSchema = createInsertSchema(documents).omit({
  id: true,
  tenantId: true,
  uploadedBy: true,
  uploadedAt: true,
  updatedAt: true,
  storageType: true,
  driveFileId: true,
});
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;

// Inbound Emails - emails received via email-to-iRescue feature
export const inboundEmails = pgTable("inbound_emails", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  messageId: text("message_id").notNull().unique(), // External message ID from email provider
  from: text("from").notNull(), // Sender email
  fromName: text("from_name"), // Sender name if available
  to: text("to").notNull(), // Recipient email (e.g., demo@mail.irescue.life)
  subject: text("subject"),
  textBody: text("text_body"), // Plain text version
  htmlBody: text("html_body"), // HTML version
  attachments: jsonb("attachments").$type<Array<{
    filename: string;
    contentType: string;
    size: number;
    url: string; // Object storage URL
  }>>(),
  status: text("status").notNull().default("unprocessed").$type<"unprocessed" | "processed" | "archived">(),
  // Optional linking to animals or documents
  linkedAnimalId: uuid("linked_animal_id").references(() => animals.id, { onDelete: 'set null' }),
  linkedDocumentId: uuid("linked_document_id").references(() => documents.id, { onDelete: 'set null' }),
  processedBy: uuid("processed_by").references(() => users.id, { onDelete: 'set null' }),
  processedAt: timestamp("processed_at"),
  notes: text("notes"), // Staff notes about this email
  receivedAt: timestamp("received_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertInboundEmailSchema = createInsertSchema(inboundEmails).omit({
  id: true,
  createdAt: true,
});
export type InsertInboundEmail = z.infer<typeof insertInboundEmailSchema>;
export type InboundEmail = typeof inboundEmails.$inferSelect;

// Page Builder Block Types
export type PageBlockType = 
  | "heading"
  | "paragraph"
  | "image"
  | "button"
  | "divider"
  | "spacer"
  | "quote"
  | "columns"
  | "list"
  | "video"
  | "callout";

export interface PageBlockBase {
  id: string;
  type: PageBlockType;
}

export interface HeadingBlock extends PageBlockBase {
  type: "heading";
  content: string;
  level: 1 | 2 | 3 | 4;
  alignment?: "left" | "center" | "right";
  textColor?: string;
}

export interface ParagraphBlock extends PageBlockBase {
  type: "paragraph";
  content: string;
  alignment?: "left" | "center" | "right";
  textColor?: string;
  fontSize?: "small" | "medium" | "large";
}

export interface ImageBlock extends PageBlockBase {
  type: "image";
  src: string;
  alt?: string;
  caption?: string;
  alignment?: "left" | "center" | "right";
  width?: "small" | "medium" | "large" | "full";
  linkUrl?: string;
  borderRadius?: "none" | "small" | "medium" | "large";
}

export interface ButtonBlock extends PageBlockBase {
  type: "button";
  text: string;
  url: string;
  variant?: "primary" | "secondary" | "outline";
  alignment?: "left" | "center" | "right";
  size?: "small" | "medium" | "large";
  openInNewTab?: boolean;
}

export interface DividerBlock extends PageBlockBase {
  type: "divider";
  style?: "solid" | "dashed" | "dotted";
  color?: string;
  thickness?: "thin" | "medium" | "thick";
}

export interface SpacerBlock extends PageBlockBase {
  type: "spacer";
  height: "small" | "medium" | "large" | "xlarge";
}

export interface QuoteBlock extends PageBlockBase {
  type: "quote";
  content: string;
  author?: string;
  alignment?: "left" | "center";
  style?: "simple" | "bordered" | "highlighted";
}

export interface ColumnData {
  id: string;
  blocks: PageBlock[];
  width?: number; // percentage (e.g., 50 for 50%)
}

export interface ColumnsBlock extends PageBlockBase {
  type: "columns";
  columns: ColumnData[];
  gap?: "small" | "medium" | "large";
}

export interface ListBlock extends PageBlockBase {
  type: "list";
  items: string[];
  style: "bullet" | "numbered" | "check";
  textColor?: string;
}

export interface VideoBlock extends PageBlockBase {
  type: "video";
  url: string; // YouTube, Vimeo, or direct video URL
  caption?: string;
  alignment?: "left" | "center" | "right";
  width?: "small" | "medium" | "large" | "full";
}

export interface CalloutBlock extends PageBlockBase {
  type: "callout";
  content: string;
  variant?: "info" | "warning" | "success" | "error";
  title?: string;
  icon?: boolean;
}

export type PageBlock = 
  | HeadingBlock 
  | ParagraphBlock 
  | ImageBlock 
  | ButtonBlock 
  | DividerBlock 
  | SpacerBlock 
  | QuoteBlock 
  | ColumnsBlock 
  | ListBlock 
  | VideoBlock 
  | CalloutBlock;

// Custom Pages - tenant-customizable informational pages (CMS)
export const customPages = pgTable("custom_pages", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  title: text("title").notNull(),
  slug: text("slug").notNull(), // URL-friendly identifier (e.g., "adoption-process")
  excerpt: text("excerpt"), // Short description for SEO/meta tags
  contentMarkdown: text("content_markdown").notNull().default(""), // Legacy: Main content in Markdown format
  contentBlocks: jsonb("content_blocks").$type<PageBlock[]>(), // New: Structured block-based content
  useBlockEditor: boolean("use_block_editor").notNull().default(true), // Whether to use new block editor
  isPublished: boolean("is_published").notNull().default(false),
  showInNavigation: boolean("show_in_navigation").notNull().default(false), // Whether to show in public header navigation
  publishedAt: timestamp("published_at"),
  createdBy: uuid("created_by").notNull().references(() => users.id, { onDelete: 'cascade' }),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  uniqueSlug: unique().on(table.tenantId, table.slug),
}));

export const insertCustomPageSchema = createInsertSchema(customPages).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  slug: z.string().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase alphanumeric with hyphens only"),
  title: z.string().min(1).max(200),
  excerpt: z.string().max(300).optional(),
  contentMarkdown: z.string().optional().default(""),
  contentBlocks: z.array(z.any()).optional(), // PageBlock[] - validated on frontend
  useBlockEditor: z.boolean().optional().default(true),
});
export type InsertCustomPage = z.infer<typeof insertCustomPageSchema>;
export type CustomPage = typeof customPages.$inferSelect;

// Content Modules - Customizable content cards for home page (Our History, Our Mission, etc.)
export const contentModules = pgTable("content_modules", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  title: text("title").notNull(), // e.g., "Our History", "Our Mission"
  content: text("content").notNull(), // HTML or markdown content
  displayOrder: integer("display_order").notNull().default(0), // Order on page (0, 1, 2)
  isActive: boolean("is_active").notNull().default(true), // Show/hide module
  // Customization options
  styling: jsonb("styling").$type<{
    backgroundColor?: string; // Hex color or CSS color
    backgroundImage?: string; // URL to background image
    imagePosition?: "background" | "above" | "below"; // Where to display the image
    textColor?: string; // Hex color or CSS color
    fontFamily?: string; // Font family (e.g., "Arial", "Georgia")
    fontSize?: string; // Font size (e.g., "16px", "1rem")
    textAlign?: "left" | "center" | "right"; // Text alignment
    showBorder?: boolean; // Whether to show a border around the module
  }>(),
  createdBy: uuid("created_by").notNull().references(() => users.id, { onDelete: 'cascade' }),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Custom validator for background image - accepts URLs or relative object storage paths
const backgroundImageSchema = z.string().refine(
  (val) => {
    if (!val || val === "") return true;
    // Allow relative paths from object storage (e.g., /objects/animals/uuid)
    if (val.startsWith('/objects/')) return true;
    // Allow full URLs
    try {
      const parsed = new URL(val);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  },
  { message: "Must be a valid URL or uploaded image path" }
).optional().or(z.literal(""));

export const insertContentModuleSchema = createInsertSchema(contentModules).omit({
  id: true,
  tenantId: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  displayOrder: z.number().int().min(0).max(10).optional(),
  isActive: z.boolean().optional(),
  styling: z.object({
    backgroundColor: z.string().optional(),
    backgroundImage: backgroundImageSchema,
    imagePosition: z.enum(["background", "above", "below"]).optional(),
    textColor: z.string().optional(),
    fontFamily: z.string().optional(),
    fontSize: z.string().optional(),
    textAlign: z.enum(["left", "center", "right"]).optional(),
    showBorder: z.boolean().optional(),
  }).optional(),
});
export type InsertContentModule = z.infer<typeof insertContentModuleSchema>;
export type ContentModule = typeof contentModules.$inferSelect;

// Push Subscriptions - Web Push notifications for mobile PWA
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(), // Public key for encryption
  auth: text("auth").notNull(), // Authentication secret
  userAgent: text("user_agent"), // Browser/device info
  isEnabled: boolean("is_enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPushSubscriptionSchema = createInsertSchema(pushSubscriptions).omit({
  id: true,
  tenantId: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPushSubscription = z.infer<typeof insertPushSubscriptionSchema>;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;

// Supply Categories - Organize supplies into categories (food, toys, medical, etc.)
export const supplyCategories = pgTable("supply_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: text("name").notNull(), // e.g., "Dog Food", "Cat Toys", "Medical Supplies"
  description: text("description"),
  icon: text("icon"), // Lucide icon name for display
  displayOrder: integer("display_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  uniqueName: unique().on(table.tenantId, table.name),
}));

export const insertSupplyCategorySchema = createInsertSchema(supplyCategories).omit({
  id: true,
  tenantId: true,
  createdAt: true,
});
export type InsertSupplyCategory = z.infer<typeof insertSupplyCategorySchema>;
export type SupplyCategory = typeof supplyCategories.$inferSelect;

// Supply Items - Individual supply needs for the rescue organization
export const supplyItems = pgTable("supply_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  categoryId: uuid("category_id").references(() => supplyCategories.id, { onDelete: 'set null' }),
  title: text("title").notNull(), // e.g., "Purina Pro Plan Large Breed Puppy Food"
  description: text("description"), // Details about the supply need
  imageUrl: text("image_url"), // Product image
  quantityNeeded: integer("quantity_needed").notNull().default(1),
  quantityFulfilled: integer("quantity_fulfilled").notNull().default(0),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }), // Price per unit (optional)
  currency: text("currency").notNull().default("USD"),
  priority: text("priority").notNull().default("normal").$type<"low" | "normal" | "high" | "urgent">(),
  status: text("status").notNull().default("active").$type<"active" | "fulfilled" | "paused">(),
  // External retailer links
  amazonUrl: text("amazon_url"), // Link to Amazon product
  chewyUrl: text("chewy_url"), // Link to Chewy product
  petsmartUrl: text("petsmart_url"), // Link to PetSmart product
  otherRetailerUrl: text("other_retailer_url"), // Any other retailer
  otherRetailerName: text("other_retailer_name"), // Name of other retailer
  // Notes
  notes: text("notes"), // Internal notes for staff
  publicNote: text("public_note"), // Note visible to donors
  createdBy: uuid("created_by").notNull().references(() => users.id, { onDelete: 'cascade' }),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSupplyItemSchema = createInsertSchema(supplyItems).omit({
  id: true,
  tenantId: true,
  createdBy: true,
  updatedBy: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  quantityNeeded: z.number().int().min(1),
  unitPrice: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  amazonUrl: z.string().url().optional().or(z.literal("")),
  chewyUrl: z.string().url().optional().or(z.literal("")),
  petsmartUrl: z.string().url().optional().or(z.literal("")),
  otherRetailerUrl: z.string().url().optional().or(z.literal("")),
});
export type InsertSupplyItem = z.infer<typeof insertSupplyItemSchema>;
export type SupplyItem = typeof supplyItems.$inferSelect;

// Supply Donations - Track donations/purchases of supply items
export const supplyDonations = pgTable("supply_donations", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  supplyItemId: uuid("supply_item_id").notNull().references(() => supplyItems.id, { onDelete: 'cascade' }),
  donorName: text("donor_name").notNull(),
  donorEmail: text("donor_email"), // Optional for anonymous donors
  quantity: integer("quantity").notNull().default(1),
  amount: numeric("amount", { precision: 10, scale: 2 }), // Donation amount (if monetary)
  currency: text("currency").notNull().default("USD"),
  donationType: text("donation_type").notNull().$type<"physical" | "monetary" | "both">(),
  // Payment/fulfillment details
  paymentMethod: text("payment_method").$type<"stripe" | "cash" | "check" | "other" | "in_kind">(),
  stripePaymentIntentId: text("stripe_payment_intent_id"), // Stripe payment ID
  fulfillmentStatus: text("fulfillment_status").notNull().default("pending").$type<"pending" | "processing" | "shipped" | "delivered" | "received">(),
  trackingNumber: text("tracking_number"),
  notes: text("notes"), // Internal notes
  donorMessage: text("donor_message"), // Message from donor
  thankYouSent: boolean("thank_you_sent").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSupplyDonationSchema = createInsertSchema(supplyDonations).omit({
  id: true,
  tenantId: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  donorName: z.string().min(1).max(100),
  donorEmail: z.string().email().optional().or(z.literal("")),
  quantity: z.number().int().min(1),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
});
export type InsertSupplyDonation = z.infer<typeof insertSupplyDonationSchema>;
export type SupplyDonation = typeof supplyDonations.$inferSelect;

// Platform Integrations - Store API credentials for external adoption platforms
export const platformIntegrations = pgTable("platform_integrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  platform: text("platform").notNull().$type<"petfinder" | "rescuegroups" | "adoptapet" | "google_workspace">(),
  isEnabled: boolean("is_enabled").notNull().default(false),
  // OAuth credentials (encrypted)
  clientIdEncrypted: text("client_id_encrypted"), // PetFinder client ID, RescueGroups API key
  clientSecretEncrypted: text("client_secret_encrypted"), // PetFinder client secret
  // OAuth tokens (encrypted, auto-refreshed)
  accessTokenEncrypted: text("access_token_encrypted"), // Current access token
  refreshTokenEncrypted: text("refresh_token_encrypted"), // OAuth refresh token (for Google Workspace)
  tokenExpiresAt: timestamp("token_expires_at"), // When token expires
  // Organization IDs on platforms
  organizationId: text("organization_id"), // Organization ID on the platform
  googleFeatures: jsonb("google_features").$type<{useGmail?: boolean; syncCalendar?: boolean; useDrive?: boolean; connectedEmail?: string; sharedDriveId?: string; sharedDriveName?: string; senderName?: string; senderEmail?: string; senderAddresses?: Array<{name: string; email: string; isDefault?: boolean}>;}>(), // Google Workspace feature flags including Shared Drive config, manual sender settings, and multiple sender addresses
  // Sync settings
  autoSync: boolean("auto_sync").notNull().default(false), // Automatically sync changes
  syncFrequency: text("sync_frequency").default("manual").$type<"manual" | "hourly" | "daily">(),
  lastSyncAt: timestamp("last_sync_at"),
  lastSyncStatus: text("last_sync_status").$type<"success" | "error" | "partial">(),
  lastSyncError: text("last_sync_error"),
  // Stats
  totalSynced: integer("total_synced").notNull().default(0),
  totalErrors: integer("total_errors").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  uniquePlatform: unique().on(table.tenantId, table.platform),
}));

export const insertPlatformIntegrationSchema = createInsertSchema(platformIntegrations).omit({
  id: true,
  tenantId: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPlatformIntegration = z.infer<typeof insertPlatformIntegrationSchema>;
export type PlatformIntegration = typeof platformIntegrations.$inferSelect;

// Animal Platform Syncs - Track which animals are synced to which platforms
export const animalPlatformSyncs = pgTable("animal_platform_syncs", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  animalId: uuid("animal_id").notNull().references(() => animals.id, { onDelete: 'cascade' }),
  platform: text("platform").notNull().$type<"petfinder" | "rescuegroups" | "adoptapet" | "google_workspace">(),
  platformAnimalId: text("platform_animal_id").notNull(), // ID on external platform
  platformUrl: text("platform_url"), // Direct link to listing on platform
  status: text("status").notNull().default("active").$type<"active" | "updated" | "removed" | "error">(),
  lastSyncedAt: timestamp("last_synced_at").notNull().defaultNow(),
  lastSyncStatus: text("last_sync_status").notNull().$type<"success" | "error">(),
  lastSyncError: text("last_sync_error"),
  syncData: jsonb("sync_data").$type<{
    views?: number;
    inquiries?: number;
    lastModified?: string;
  }>(), // Platform-specific data
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  uniqueAnimalPlatform: unique().on(table.animalId, table.platform),
}));

export const insertAnimalPlatformSyncSchema = createInsertSchema(animalPlatformSyncs).omit({
  id: true,
  tenantId: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAnimalPlatformSync = z.infer<typeof insertAnimalPlatformSyncSchema>;
export type AnimalPlatformSync = typeof animalPlatformSyncs.$inferSelect;

// Feature Flags - Control feature availability per tenant
export const featureFlags = pgTable("feature_flags", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: 'cascade' }), // NULL means platform-wide default
  featureName: text("feature_name").notNull(), // e.g., "advanced_reports", "email_campaigns"
  isEnabled: boolean("is_enabled").notNull().default(false),
  config: jsonb("config").$type<Record<string, any>>(), // Feature-specific configuration
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  uniqueFeature: unique().on(table.tenantId, table.featureName),
}));

export const insertFeatureFlagSchema = createInsertSchema(featureFlags).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertFeatureFlag = z.infer<typeof insertFeatureFlagSchema>;
export type FeatureFlag = typeof featureFlags.$inferSelect;

// Audit Logs - Track all platform admin actions
export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: 'cascade' }), // NULL for platform-wide actions
  action: text("action").notNull(), // e.g., "tenant.create", "user.disable", "feature_flag.update"
  entityType: text("entity_type"), // e.g., "tenant", "user", "feature_flag"
  entityId: text("entity_id"), // ID of affected entity
  changes: jsonb("changes").$type<{
    before?: Record<string, any>;
    after?: Record<string, any>;
  }>(), // What changed
  metadata: jsonb("metadata").$type<Record<string, any>>(), // Additional context
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({
  id: true,
  createdAt: true,
});
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;

// Platform Announcements - System-wide messages for all tenants
export const platformAnnouncements = pgTable("platform_announcements", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  type: text("type").notNull().$type<"info" | "warning" | "success" | "error">(),
  priority: text("priority").notNull().default("normal").$type<"low" | "normal" | "high" | "urgent">(),
  isActive: boolean("is_active").notNull().default(true),
  startDate: timestamp("start_date").notNull().defaultNow(),
  endDate: timestamp("end_date"), // NULL means no expiration
  targetTenants: text("target_tenants").array(), // NULL means all tenants, or specific tenant IDs
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPlatformAnnouncementSchema = createInsertSchema(platformAnnouncements).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPlatformAnnouncement = z.infer<typeof insertPlatformAnnouncementSchema>;
export type PlatformAnnouncement = typeof platformAnnouncements.$inferSelect;

// Platform Settings - System-wide configuration
export const platformSettings = pgTable("platform_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(), // e.g., "maintenance_mode", "new_tenant_approval_required"
  value: jsonb("value").notNull().$type<any>(),
  description: text("description"),
  category: text("category").notNull().default("general").$type<"general" | "security" | "email" | "billing" | "features">(),
  isPublic: boolean("is_public").notNull().default(false), // Whether non-admins can read this setting
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPlatformSettingSchema = createInsertSchema(platformSettings).omit({
  id: true,
  updatedAt: true,
});
export type InsertPlatformSetting = z.infer<typeof insertPlatformSettingSchema>;
export type PlatformSetting = typeof platformSettings.$inferSelect;

// Platform Feedback - Tenant admins can submit feedback/issues to platform admins
export const platformFeedback = pgTable("platform_feedback", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text("type").notNull().$type<"bug" | "feature_request" | "suggestion" | "issue" | "question">(),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  priority: text("priority").notNull().default("normal").$type<"low" | "normal" | "high" | "urgent">(),
  status: text("status").notNull().default("pending").$type<"pending" | "in_progress" | "resolved" | "closed">(),
  response: text("response"), // Platform admin response
  respondedBy: uuid("responded_by").references(() => users.id), // Platform admin who responded
  respondedAt: timestamp("responded_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPlatformFeedbackSchema = createInsertSchema(platformFeedback).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPlatformFeedback = z.infer<typeof insertPlatformFeedbackSchema>;
export type PlatformFeedback = typeof platformFeedback.$inferSelect;

// Page Permissions - Control which roles can access which pages per tenant
export const pagePermissions = pgTable("page_permissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  pageId: text("page_id").notNull(), // e.g., "dashboard", "animals", "volunteers", "finance", etc.
  displayName: text("display_name").notNull(), // Human-readable name, e.g., "Dashboard", "Animals Management"
  description: text("description"), // Optional description of what this page does
  allowedRoles: text("allowed_roles").array().notNull().$type<("admin" | "board_member" | "staff" | "foster" | "volunteer")[]>(), // Roles that can access this page
  isActive: boolean("is_active").notNull().default(true), // Allow temporarily disabling pages
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  uniquePagePerTenant: unique().on(table.tenantId, table.pageId),
}));

export const insertPagePermissionSchema = createInsertSchema(pagePermissions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPagePermission = z.infer<typeof insertPagePermissionSchema>;
export type PagePermission = typeof pagePermissions.$inferSelect;

// OAuth States - Secure server-side storage for OAuth nonces (prevents CSRF/state forgery attacks)
export const oauthStates = pgTable("oauth_states", {
  id: uuid("id").primaryKey().defaultRandom(),
  nonce: text("nonce").notNull().unique(), // Random UUID used as state parameter
  provider: text("provider").notNull().$type<"google_workspace">(), // OAuth provider
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  subdomain: text("subdomain"), // Cache tenant subdomain for reliable redirects even if tenant lookup fails
  expiresAt: timestamp("expires_at").notNull(), // States expire after 10 minutes
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertOAuthStateSchema = createInsertSchema(oauthStates).omit({
  id: true,
  createdAt: true,
});
export type InsertOAuthState = z.infer<typeof insertOAuthStateSchema>;
export type OAuthState = typeof oauthStates.$inferSelect;

// Demo Requests - Lead generation from platform landing page
export const demoRequests = pgTable("demo_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  leadType: text("lead_type").notNull().default("contact_sales").$type<"contact_sales" | "demo_access">(),
  fullName: text("full_name"), // Required for contact_sales, optional for demo_access
  email: text("email").notNull(),
  organizationName: text("organization_name"), // Required for contact_sales, not needed for demo_access
  phone: text("phone"),
  message: text("message"), // Optional message from the requester
  landingPageUrl: text("landing_page_url"), // Track where the lead came from
  referrer: text("referrer"), // Track referrer for analytics
  status: text("status").notNull().default("pending").$type<"pending" | "contacted" | "demo_sent" | "converted" | "declined">(),
  notes: text("notes"), // Internal notes for follow-up
  createdAt: timestamp("created_at").notNull().defaultNow(),
  contactedAt: timestamp("contacted_at"), // When they were first contacted
});

export const insertDemoRequestSchema = createInsertSchema(demoRequests).omit({
  id: true,
  createdAt: true,
});
export type InsertDemoRequest = z.infer<typeof insertDemoRequestSchema>;
export type DemoRequest = typeof demoRequests.$inferSelect;

// Grants table - grant applications and lifecycle management
export const grants = pgTable("grants", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  funderName: text("funder_name").notNull(), // e.g., "PetSmart Charities"
  programName: text("program_name").notNull(), // e.g., "Fall 2026 Grant"
  funderWebsite: text("funder_website"),
  status: text("status").notNull().default("researching").$type<"researching" | "in_progress" | "submitted" | "awarded" | "denied" | "completed">(),
  applicationDeadline: timestamp("application_deadline"),
  amountRequested: numeric("amount_requested", { precision: 10, scale: 2 }),
  amountAwarded: numeric("amount_awarded", { precision: 10, scale: 2 }),
  awardDate: timestamp("award_date"),
  finalReportDeadline: timestamp("final_report_deadline"),
  finalReportSubmitted: boolean("final_report_submitted").notNull().default(false),
  programArea: text("program_area").$type<"medical" | "operations" | "spay_neuter" | "senior_program" | "special_needs" | "foster_program" | "facility" | "unrestricted" | "other">(), // Type of funding
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertGrantSchema = createInsertSchema(grants).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertGrant = z.infer<typeof insertGrantSchema>;
export type Grant = typeof grants.$inferSelect;

// Grant Documents table - store boilerplate and grant-specific documents
export const grantDocuments = pgTable("grant_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  grantId: uuid("grant_id").references(() => grants.id, { onDelete: 'cascade' }), // null = boilerplate document
  documentType: text("document_type").notNull().$type<"501c3_letter" | "board_list" | "budget" | "financial_statement" | "mission_statement" | "application" | "final_report" | "other">(),
  title: text("title").notNull(),
  fileUrl: text("file_url").notNull(), // Object storage URL
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size"), // bytes
  uploadedBy: uuid("uploaded_by").notNull().references(() => users.id),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertGrantDocumentSchema = createInsertSchema(grantDocuments).omit({
  id: true,
  createdAt: true,
});
export type InsertGrantDocument = z.infer<typeof insertGrantDocumentSchema>;
export type GrantDocument = typeof grantDocuments.$inferSelect;

// ============================================================================
// Smart Adoption Workflow Tables
// ============================================================================

// Adoption Contract Templates table - customizable contract templates per tenant
export const adoptionContractTemplates = pgTable("adoption_contract_templates", {
  id: serial("id").primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: text("name").notNull(), // e.g., "Standard Adoption Contract"
  version: text("version").notNull().default("1.0"),
  htmlTemplate: text("html_template").notNull(), // HTML with {{mustache}} placeholders
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedBy: uuid("updated_by").references(() => users.id),
});

export const insertAdoptionContractTemplateSchema = createInsertSchema(adoptionContractTemplates).omit({
  id: true,
  createdAt: true,
});
export type InsertAdoptionContractTemplate = z.infer<typeof insertAdoptionContractTemplateSchema>;
export type AdoptionContractTemplate = typeof adoptionContractTemplates.$inferSelect;

// Adoption Checkout Sessions table - manages the end-to-end adoption checkout process
export const adoptionCheckoutSessions = pgTable("adoption_checkout_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  applicationId: uuid("application_id").notNull().references(() => applications.id, { onDelete: 'cascade' }),
  animalId: uuid("animal_id").notNull().references(() => animals.id, { onDelete: 'cascade' }),
  adopterContactId: uuid("adopter_contact_id").references(() => contacts.id, { onDelete: 'set null' }),
  grantId: uuid("grant_id").references(() => grants.id, { onDelete: 'set null' }), // Optional, for subsidized adoptions
  staffInitiatedBy: uuid("staff_initiated_by").notNull().references(() => users.id, { onDelete: 'cascade' }),
  baseFee: text("base_fee").notNull(), // Adoption fee amount (stored as text for precision)
  donationBoost: text("donation_boost").default("0"),
  coverFees: boolean("cover_fees").default(false),
  processor: text("processor").notNull().default("stripe").$type<"stripe">(),
  paymentIntentId: text("payment_intent_id"), // Stripe PaymentIntent ID
  status: text("status").notNull().default("initiated").$type<"initiated" | "awaiting_signature" | "awaiting_payment" | "completed" | "cancelled" | "expired">(),
  secureTokenHash: text("secure_token_hash").notNull(), // Hashed token for public link
  expiresAt: timestamp("expires_at").notNull(), // 72 hours default
  signedAt: timestamp("signed_at"),
  paidAt: timestamp("paid_at"),
  totals: jsonb("totals").$type<{ subtotal: string; fees: string; total: string }>(), // Fee breakdown
  metadata: jsonb("metadata").$type<Record<string, any>>(), // Audit trail, IP addresses, etc.
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAdoptionCheckoutSessionSchema = createInsertSchema(adoptionCheckoutSessions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAdoptionCheckoutSession = z.infer<typeof insertAdoptionCheckoutSessionSchema>;
export type AdoptionCheckoutSession = typeof adoptionCheckoutSessions.$inferSelect;

// Adoption Contracts table - signed contracts with full audit trail
export const adoptionContracts = pgTable("adoption_contracts", {
  id: serial("id").primaryKey(),
  sessionId: uuid("session_id").notNull().references(() => adoptionCheckoutSessions.id, { onDelete: 'cascade' }),
  templateSnapshot: jsonb("template_snapshot").notNull(), // Snapshot of template used
  contractPdfUrl: text("contract_pdf_url"), // Object storage URL
  signatureImageUrl: text("signature_image_url"), // Object storage URL
  signerName: text("signer_name").notNull(),
  signerEmail: text("signer_email").notNull(),
  signedIp: text("signed_ip"),
  signedUserAgent: text("signed_user_agent"),
  signedAt: timestamp("signed_at").notNull(),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAdoptionContractSchema = createInsertSchema(adoptionContracts).omit({
  id: true,
  createdAt: true,
});
export type InsertAdoptionContract = z.infer<typeof insertAdoptionContractSchema>;
export type AdoptionContract = typeof adoptionContracts.$inferSelect;

// Adoption Payments table - payment records for adoptions
export const adoptionPayments = pgTable("adoption_payments", {
  id: serial("id").primaryKey(),
  sessionId: uuid("session_id").notNull().references(() => adoptionCheckoutSessions.id, { onDelete: 'cascade' }),
  processor: text("processor").notNull().$type<"stripe">(),
  amountBreakdown: jsonb("amount_breakdown").notNull().$type<{ baseFee: string; donationBoost: string; processingFee: string; total: string }>(),
  receiptUrl: text("receipt_url"), // PDF receipt URL
  chargeId: text("charge_id"), // Processor's charge/transaction ID
  status: text("status").notNull().$type<"pending" | "succeeded" | "failed" | "refunded">(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAdoptionPaymentSchema = createInsertSchema(adoptionPayments).omit({
  id: true,
  createdAt: true,
});
export type InsertAdoptionPayment = z.infer<typeof insertAdoptionPaymentSchema>;
export type AdoptionPayment = typeof adoptionPayments.$inferSelect;

// Post-Adoption Journeys table - automated follow-up communications
export const postAdoptionJourneys = pgTable("post_adoption_journeys", {
  id: serial("id").primaryKey(),
  sessionId: uuid("session_id").notNull().references(() => adoptionCheckoutSessions.id, { onDelete: 'cascade' }),
  schedule: jsonb("schedule").notNull().$type<Array<{ offsetDays: number; type: string; templateId: string }>>(),
  state: jsonb("state").notNull().default(sql`'{}'::jsonb`).$type<{ sent?: string[]; pending?: string[] }>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPostAdoptionJourneySchema = createInsertSchema(postAdoptionJourneys).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPostAdoptionJourney = z.infer<typeof insertPostAdoptionJourneySchema>;
export type PostAdoptionJourney = typeof postAdoptionJourneys.$inferSelect;

// Scheduled Communications table - 3-3-3 Rule adoption retention emails
export const scheduledCommunications = pgTable("scheduled_communications", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  // Link to adoption
  adoptionId: uuid("adoption_id").notNull().references(() => adoptionCheckoutSessions.id, { onDelete: 'cascade' }),
  animalId: uuid("animal_id").notNull().references(() => animals.id, { onDelete: 'cascade' }),
  // Cached adopter info for easy access
  adopterEmail: text("adopter_email").notNull(),
  adopterName: text("adopter_name").notNull(),
  animalName: text("animal_name").notNull(),
  // Scheduling
  sendDate: timestamp("send_date").notNull(),
  messageType: text("message_type").notNull().$type<"3_days" | "3_weeks" | "3_months">(),
  // Status tracking
  status: text("status").notNull().default("pending").$type<"pending" | "sent" | "cancelled">(),
  sentAt: timestamp("sent_at"),
  cancelReason: text("cancel_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertScheduledCommunicationSchema = createInsertSchema(scheduledCommunications).omit({
  id: true,
  sentAt: true,
  createdAt: true,
});
export type InsertScheduledCommunication = z.infer<typeof insertScheduledCommunicationSchema>;
export type ScheduledCommunication = typeof scheduledCommunications.$inferSelect;

// Grant Allocations table - track grant fund usage for subsidized adoptions
export const grantAllocations = pgTable("grant_allocations", {
  id: serial("id").primaryKey(),
  grantId: uuid("grant_id").notNull().references(() => grants.id, { onDelete: 'cascade' }),
  sessionId: uuid("session_id").notNull().references(() => adoptionCheckoutSessions.id, { onDelete: 'cascade' }),
  waiverAmount: text("waiver_amount").notNull(), // Amount waived from grant
  allocatedAt: timestamp("allocated_at").notNull().defaultNow(),
});

export const insertGrantAllocationSchema = createInsertSchema(grantAllocations).omit({
  id: true,
  allocatedAt: true,
});
export type InsertGrantAllocation = z.infer<typeof insertGrantAllocationSchema>;
export type GrantAllocation = typeof grantAllocations.$inferSelect;

// Medical Reminder Settings table - tenant-level configuration for medical reminders
export const medicalReminderSettings = pgTable("medical_reminder_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }).unique(),
  isEnabled: boolean("is_enabled").notNull().default(true),
  // Lead time settings (days before due date to send reminder)
  vaccineLeadDays: integer("vaccine_lead_days").notNull().default(7),
  prescriptionLeadDays: integer("prescription_lead_days").notNull().default(3),
  examLeadDays: integer("exam_lead_days").notNull().default(7),
  procedureLeadDays: integer("procedure_lead_days").notNull().default(3),
  // Notification preferences
  sendDailyDigest: boolean("send_daily_digest").notNull().default(true), // Send one email per day with all reminders
  sendIndividualAlerts: boolean("send_individual_alerts").notNull().default(false), // Send separate emails for each item
  sendOverdueAlerts: boolean("send_overdue_alerts").notNull().default(true), // Send alerts for overdue items
  // Recipient settings
  notifyAdmins: boolean("notify_admins").notNull().default(true),
  notifyStaff: boolean("notify_staff").notNull().default(true),
  notifyFosters: boolean("notify_fosters").notNull().default(true), // Notify fosters about their foster animals
  // Foster confirmation
  requireFosterConfirmation: boolean("require_foster_confirmation").notNull().default(false), // Require fosters to confirm medication given
  escalationHours: integer("escalation_hours").notNull().default(24), // Hours before escalating to staff if foster doesn't confirm
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertMedicalReminderSettingsSchema = createInsertSchema(medicalReminderSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertMedicalReminderSettings = z.infer<typeof insertMedicalReminderSettingsSchema>;
export type MedicalReminderSettings = typeof medicalReminderSettings.$inferSelect;

// Medical Reminders table - individual reminder records
export const medicalReminders = pgTable("medical_reminders", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  animalId: uuid("animal_id").notNull().references(() => animals.id, { onDelete: 'cascade' }),
  reminderType: text("reminder_type").notNull().$type<"vaccine_due" | "prescription_ending" | "exam_followup" | "procedure_scheduled" | "overdue">(),
  // Reference to the source record
  sourceType: text("source_type").notNull().$type<"vaccine" | "prescription" | "exam" | "procedure">(),
  sourceId: uuid("source_id").notNull(), // ID of the vaccine/prescription/exam/procedure record
  // Due date and item info
  dueDate: timestamp("due_date").notNull(),
  itemName: text("item_name").notNull(), // e.g., "Rabies Vaccine", "Heartworm Medication"
  // Status tracking
  status: text("status").notNull().default("pending").$type<"pending" | "sent" | "acknowledged" | "completed" | "escalated">(),
  // Foster confirmation tracking (if applicable)
  assignedFosterId: uuid("assigned_foster_id").references(() => users.id, { onDelete: 'set null' }),
  fosterConfirmedAt: timestamp("foster_confirmed_at"),
  escalatedAt: timestamp("escalated_at"),
  // Email tracking
  lastSentAt: timestamp("last_sent_at"),
  sentCount: integer("sent_count").notNull().default(0),
  // Metadata
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertMedicalReminderSchema = createInsertSchema(medicalReminders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertMedicalReminder = z.infer<typeof insertMedicalReminderSchema>;
export type MedicalReminder = typeof medicalReminders.$inferSelect;

// Medical Reminder Logs table - track all reminder emails sent
export const medicalReminderLogs = pgTable("medical_reminder_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  reminderId: uuid("reminder_id").references(() => medicalReminders.id, { onDelete: 'cascade' }),
  recipientEmail: text("recipient_email").notNull(),
  recipientName: text("recipient_name"),
  recipientRole: text("recipient_role").$type<"admin" | "staff" | "foster">(),
  emailType: text("email_type").notNull().$type<"digest" | "individual" | "overdue" | "escalation" | "foster_confirmation">(),
  subject: text("subject").notNull(),
  sentAt: timestamp("sent_at").notNull().defaultNow(),
  messageId: text("message_id"), // Email service message ID
  status: text("status").notNull().default("sent").$type<"sent" | "delivered" | "failed">(),
  errorMessage: text("error_message"),
});

export const insertMedicalReminderLogSchema = createInsertSchema(medicalReminderLogs).omit({
  id: true,
});
export type InsertMedicalReminderLog = z.infer<typeof insertMedicalReminderLogSchema>;
export type MedicalReminderLog = typeof medicalReminderLogs.$inferSelect;

// ============================================
// SHOP / FUNDRAISING TABLES
// ============================================

// Shop Products table - main product catalog for fundraising
export const shopProducts = pgTable("shop_products", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  slug: text("slug").notNull(), // URL-friendly identifier for sharing
  description: text("description"),
  productType: text("product_type").notNull().$type<"physical" | "digital" | "raffle">(),
  status: text("status").notNull().default("draft").$type<"draft" | "active" | "paused" | "archived">(),
  // Pricing
  basePrice: text("base_price").notNull(), // Stored as string for precision (e.g., "25.00")
  compareAtPrice: text("compare_at_price"), // Original price for showing discounts
  // Images
  imageUrls: text("image_urls").array().notNull().default(sql`ARRAY[]::text[]`),
  // Inventory (for physical products)
  trackInventory: boolean("track_inventory").notNull().default(false),
  totalInventory: integer("total_inventory"), // Only used if trackInventory is true
  allowBackorders: boolean("allow_backorders").notNull().default(false),
  // Purchase limits
  maxPerOrder: integer("max_per_order"), // Max quantity per order (null = unlimited)
  // Category/tags
  category: text("category"), // e.g., "apparel", "accessories", "raffle"
  tags: text("tags").array().default(sql`ARRAY[]::text[]`),
  // SEO/Sharing
  metaTitle: text("meta_title"),
  metaDescription: text("meta_description"),
  // Raffle-specific fields
  raffleDrawDate: timestamp("raffle_draw_date"), // When the raffle will be drawn
  rafflePrizeDescription: text("raffle_prize_description"), // What the winner gets
  // Display settings
  featured: boolean("featured").notNull().default(false),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  uniqueSlug: unique().on(table.tenantId, table.slug),
}));

export const insertShopProductSchema = createInsertSchema(shopProducts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertShopProduct = z.infer<typeof insertShopProductSchema>;
export type ShopProduct = typeof shopProducts.$inferSelect;

// Shop Product Variants table - size/color options for products
export const shopProductVariants = pgTable("shop_product_variants", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").notNull().references(() => shopProducts.id, { onDelete: 'cascade' }),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: text("name").notNull(), // e.g., "Small", "Medium", "Large", "Red", "Blue"
  sku: text("sku"), // Stock keeping unit
  // Variant-specific pricing (delta from base price)
  priceAdjustment: text("price_adjustment").notNull().default("0"), // e.g., "+5.00" or "-2.00"
  // Inventory
  inventory: integer("inventory").notNull().default(0),
  // Options (for structured data)
  optionType: text("option_type").$type<"size" | "color" | "style" | "other">(),
  optionValue: text("option_value"), // e.g., "XL", "#FF0000", "Crew Neck"
  // Status
  isActive: boolean("is_active").notNull().default(true),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertShopProductVariantSchema = createInsertSchema(shopProductVariants).omit({
  id: true,
  createdAt: true,
});
export type InsertShopProductVariant = z.infer<typeof insertShopProductVariantSchema>;
export type ShopProductVariant = typeof shopProductVariants.$inferSelect;

// Shop Orders table - customer orders
export const shopOrders = pgTable("shop_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  orderNumber: text("order_number").notNull(), // Human-readable order number (e.g., "ORD-001234")
  // Customer info (not requiring account)
  customerEmail: text("customer_email").notNull(),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone"),
  // Shipping address (for physical products)
  shippingAddress: jsonb("shipping_address").$type<{
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  }>(),
  // Order totals
  subtotal: text("subtotal").notNull(), // Before tax/fees
  shippingAmount: text("shipping_amount").notNull().default("0"),
  taxAmount: text("tax_amount").notNull().default("0"),
  totalAmount: text("total_amount").notNull(),
  // Payment status
  paymentStatus: text("payment_status").notNull().default("pending").$type<"pending" | "processing" | "paid" | "failed" | "refunded" | "partially_refunded">(),
  paymentMethod: text("payment_method").$type<"stripe">(),
  // Stripe payment tracking
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  stripeChargeId: text("stripe_charge_id"),
  // Fulfillment status (for physical products)
  fulfillmentStatus: text("fulfillment_status").notNull().default("unfulfilled").$type<"unfulfilled" | "processing" | "shipped" | "delivered" | "cancelled">(),
  trackingNumber: text("tracking_number"),
  trackingUrl: text("tracking_url"),
  shippedAt: timestamp("shipped_at"),
  deliveredAt: timestamp("delivered_at"),
  // Notes
  customerNotes: text("customer_notes"), // Notes from customer at checkout
  internalNotes: text("internal_notes"), // Admin-only notes
  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  uniqueOrderNumber: unique().on(table.tenantId, table.orderNumber),
}));

export const insertShopOrderSchema = createInsertSchema(shopOrders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertShopOrder = z.infer<typeof insertShopOrderSchema>;
export type ShopOrder = typeof shopOrders.$inferSelect;

// Shop Order Items table - individual items in an order
export const shopOrderItems = pgTable("shop_order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => shopOrders.id, { onDelete: 'cascade' }),
  productId: uuid("product_id").notNull().references(() => shopProducts.id, { onDelete: 'restrict' }),
  variantId: uuid("variant_id").references(() => shopProductVariants.id, { onDelete: 'restrict' }),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  // Snapshot of product at time of purchase
  productName: text("product_name").notNull(),
  variantName: text("variant_name"),
  productType: text("product_type").notNull().$type<"physical" | "digital" | "raffle">(),
  // Quantity and pricing
  quantity: integer("quantity").notNull().default(1),
  unitPrice: text("unit_price").notNull(), // Price per item at time of purchase
  totalPrice: text("total_price").notNull(), // quantity * unitPrice
  // Raffle-specific: ticket numbers for raffle items
  raffleTicketNumbers: text("raffle_ticket_numbers").array(), // e.g., ["001", "002", "003"]
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertShopOrderItemSchema = createInsertSchema(shopOrderItems).omit({
  id: true,
  createdAt: true,
});
export type InsertShopOrderItem = z.infer<typeof insertShopOrderItemSchema>;
export type ShopOrderItem = typeof shopOrderItems.$inferSelect;

// Shop Raffle Drawings table - track raffle winners
export const shopRaffleDrawings = pgTable("shop_raffle_drawings", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").notNull().references(() => shopProducts.id, { onDelete: 'cascade' }),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  // Winner info
  winningOrderItemId: uuid("winning_order_item_id").references(() => shopOrderItems.id, { onDelete: 'set null' }),
  winningTicketNumber: text("winning_ticket_number"),
  winnerName: text("winner_name"),
  winnerEmail: text("winner_email"),
  winnerPhone: text("winner_phone"),
  // Drawing details
  status: text("status").notNull().default("pending").$type<"pending" | "drawn" | "notified" | "claimed" | "expired">(),
  drawnAt: timestamp("drawn_at"),
  drawnBy: uuid("drawn_by").references(() => users.id, { onDelete: 'set null' }), // Admin who performed the drawing
  notifiedAt: timestamp("notified_at"),
  claimedAt: timestamp("claimed_at"),
  // Notes
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertShopRaffleDrawingSchema = createInsertSchema(shopRaffleDrawings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertShopRaffleDrawing = z.infer<typeof insertShopRaffleDrawingSchema>;
export type ShopRaffleDrawing = typeof shopRaffleDrawings.$inferSelect;

// ============================================
// COLLABORATION HUB / TRANSPORT TABLES
// ============================================

// Transport Events table - for coordinating animal transport/transfers between rescues
export const transportEvents = pgTable("transport_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  // Basic info
  name: text("name").notNull(), // e.g., "TX to CO Transport - November 2024"
  description: text("description"),
  // Transport type
  transportType: text("transport_type").notNull().$type<"outbound" | "inbound" | "relay" | "internal">(),
  // Status
  status: text("status").notNull().default("planning").$type<"planning" | "confirmed" | "in_progress" | "completed" | "cancelled">(),
  // Route info
  originLocation: text("origin_location"), // e.g., "Houston, TX"
  destinationLocation: text("destination_location"), // e.g., "Denver, CO"
  waypoints: jsonb("waypoints").$type<Array<{
    location: string;
    estimatedArrival?: string;
    notes?: string;
  }>>(),
  // Schedule
  departureDate: timestamp("departure_date"),
  estimatedArrivalDate: timestamp("estimated_arrival_date"),
  actualDepartureDate: timestamp("actual_departure_date"),
  actualArrivalDate: timestamp("actual_arrival_date"),
  // Animals being transported
  animalIds: text("animal_ids").array().default(sql`ARRAY[]::text[]`), // References to animal IDs
  animalCount: integer("animal_count").notNull().default(0),
  // Partner organization info
  partnerOrganizationName: text("partner_organization_name"),
  partnerContactName: text("partner_contact_name"),
  partnerContactEmail: text("partner_contact_email"),
  partnerContactPhone: text("partner_contact_phone"),
  // SMS notifications
  smsSubscribers: text("sms_subscribers").array().default(sql`ARRAY[]::text[]`), // Phone numbers to receive transport alerts
  // Google Chat integration
  googleChatSpaceId: text("google_chat_space_id"), // The Chat space name (e.g., "spaces/AAAA...")
  googleChatSpaceUrl: text("google_chat_space_url"), // Direct URL to open the chat
  // Mobile Run Sheet - shareable link for drivers
  runSheetToken: text("run_sheet_token"), // Unique token for public run sheet access
  runSheetTokenExpiresAt: timestamp("run_sheet_token_expires_at"),
  // Logistics
  vehicleInfo: text("vehicle_info"), // e.g., "White Van - License ABC123"
  driverName: text("driver_name"),
  driverPhone: text("driver_phone"),
  // Notes and attachments
  notes: text("notes"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertTransportEventSchema = createInsertSchema(transportEvents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTransportEvent = z.infer<typeof insertTransportEventSchema>;
export type TransportEvent = typeof transportEvents.$inferSelect;

// Transport Participants table - track who is involved in each transport
export const transportParticipants = pgTable("transport_participants", {
  id: uuid("id").primaryKey().defaultRandom(),
  transportId: uuid("transport_id").notNull().references(() => transportEvents.id, { onDelete: 'cascade' }),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  // Participant info (can be a user or external contact)
  userId: uuid("user_id").references(() => users.id, { onDelete: 'cascade' }),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: 'cascade' }),
  // External participant (if not in system)
  externalName: text("external_name"),
  externalEmail: text("external_email"),
  externalPhone: text("external_phone"),
  externalOrganization: text("external_organization"),
  // Role in transport
  role: text("role").notNull().$type<"coordinator" | "driver" | "volunteer" | "foster_pickup" | "foster_dropoff" | "vet" | "observer">(),
  // Assignment details
  assignedLeg: text("assigned_leg"), // e.g., "Leg 1: Houston to Dallas"
  notes: text("notes"),
  // Status
  status: text("status").notNull().default("invited").$type<"invited" | "confirmed" | "declined" | "completed">(),
  confirmedAt: timestamp("confirmed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTransportParticipantSchema = createInsertSchema(transportParticipants).omit({
  id: true,
  createdAt: true,
});
export type InsertTransportParticipant = z.infer<typeof insertTransportParticipantSchema>;
export type TransportParticipant = typeof transportParticipants.$inferSelect;

// Transfer Alerts table - SOS broadcasts for urgent capacity/transfer needs
export const transferAlerts = pgTable("transfer_alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  // Alert info
  title: text("title").notNull(), // e.g., "URGENT: Over capacity - need transfer help"
  message: text("message").notNull(),
  urgencyLevel: text("urgency_level").notNull().$type<"low" | "medium" | "high" | "critical">(),
  // Alert type
  alertType: text("alert_type").notNull().$type<"capacity" | "transport_needed" | "foster_needed" | "medical_emergency" | "general">(),
  // Animal info
  animalCount: integer("animal_count"),
  animalIds: text("animal_ids").array().default(sql`ARRAY[]::text[]`),
  species: text("species"), // "dogs", "cats", "mixed"
  // Location
  location: text("location"),
  region: text("region"), // e.g., "Southeast Texas", "Colorado Front Range"
  // Contact
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  // Status
  status: text("status").notNull().default("active").$type<"active" | "responded" | "resolved" | "expired" | "cancelled">(),
  // Response tracking
  viewCount: integer("view_count").notNull().default(0),
  responseCount: integer("response_count").notNull().default(0),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: uuid("resolved_by").references(() => users.id, { onDelete: 'set null' }),
  resolutionNotes: text("resolution_notes"),
  // Broadcast tracking
  broadcastedVia: text("broadcasted_via").array().default(sql`ARRAY[]::text[]`), // ["webhook", "email", "google_chat"]
  webhookUrl: text("webhook_url"), // Regional network webhook for broadcasting
  lastBroadcastAt: timestamp("last_broadcast_at"),
  // Link to view details
  publicLink: text("public_link"), // Public URL to view available animals
  createdBy: uuid("created_by").references(() => users.id, { onDelete: 'set null' }),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertTransferAlertSchema = createInsertSchema(transferAlerts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTransferAlert = z.infer<typeof insertTransferAlertSchema>;
export type TransferAlert = typeof transferAlerts.$inferSelect;

// Transfer Alert Responses table - track responses to alerts
export const transferAlertResponses = pgTable("transfer_alert_responses", {
  id: uuid("id").primaryKey().defaultRandom(),
  alertId: uuid("alert_id").notNull().references(() => transferAlerts.id, { onDelete: 'cascade' }),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  // Responder info
  responderTenantId: uuid("responder_tenant_id").references(() => tenants.id, { onDelete: 'set null' }), // If from another rescue
  responderName: text("responder_name").notNull(),
  responderEmail: text("responder_email").notNull(),
  responderPhone: text("responder_phone"),
  responderOrganization: text("responder_organization"),
  // Response details
  canAcceptCount: integer("can_accept_count"), // How many animals they can take
  canProvideTransport: boolean("can_provide_transport").notNull().default(false),
  canProvideFoster: boolean("can_provide_foster").notNull().default(false),
  message: text("message"),
  // Status
  status: text("status").notNull().default("pending").$type<"pending" | "accepted" | "declined" | "completed">(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertTransferAlertResponseSchema = createInsertSchema(transferAlertResponses).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTransferAlertResponse = z.infer<typeof insertTransferAlertResponseSchema>;
export type TransferAlertResponse = typeof transferAlertResponses.$inferSelect;

// Transport Updates table - timeline/activity log for transports
export const transportUpdates = pgTable("transport_updates", {
  id: uuid("id").primaryKey().defaultRandom(),
  transportId: uuid("transport_id").notNull().references(() => transportEvents.id, { onDelete: 'cascade' }),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  // Update info
  updateType: text("update_type").notNull().$type<"status_change" | "location_update" | "participant_added" | "participant_confirmed" | "message" | "photo" | "eta_update" | "issue_reported">(),
  title: text("title").notNull(),
  message: text("message"),
  // Location update (if applicable)
  location: text("location"),
  latitude: text("latitude"),
  longitude: text("longitude"),
  // Media (for photos)
  imageUrls: text("image_urls").array().default(sql`ARRAY[]::text[]`),
  // Google Chat integration (if message was synced)
  googleChatMessageId: text("google_chat_message_id"),
  // Created by
  createdBy: uuid("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdByName: text("created_by_name"), // For external updates
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTransportUpdateSchema = createInsertSchema(transportUpdates).omit({
  id: true,
  createdAt: true,
});
export type InsertTransportUpdate = z.infer<typeof insertTransportUpdateSchema>;
export type TransportUpdate = typeof transportUpdates.$inferSelect;

// Transport Timeline Events table - unified activity log and communication channel
export const transportTimelineEvents = pgTable("transport_timeline_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  transportId: uuid("transport_id").notNull().references(() => transportEvents.id, { onDelete: 'cascade' }),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  // User who created the event (null for system-generated events)
  userId: uuid("user_id").references(() => users.id, { onDelete: 'set null' }),
  userName: text("user_name"), // Cached for display when user is deleted
  // Event type
  eventType: text("event_type").notNull().$type<"comment" | "status_change" | "alert" | "log">(),
  // Event content
  message: text("message").notNull(),
  // Optional metadata (GPS coordinates, stop ID, delay duration, etc.)
  metadata: jsonb("metadata").$type<{
    stopId?: string;
    stopName?: string;
    latitude?: string;
    longitude?: string;
    delayMinutes?: number;
    previousStatus?: string;
    newStatus?: string;
    animalId?: string;
    animalName?: string;
  }>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTransportTimelineEventSchema = createInsertSchema(transportTimelineEvents).omit({
  id: true,
  createdAt: true,
});
export type InsertTransportTimelineEvent = z.infer<typeof insertTransportTimelineEventSchema>;
export type TransportTimelineEvent = typeof transportTimelineEvents.$inferSelect;

// Transport Stops table - defines the route stops for a transport
export const transportStops = pgTable("transport_stops", {
  id: uuid("id").primaryKey().defaultRandom(),
  transportId: uuid("transport_id").notNull().references(() => transportEvents.id, { onDelete: 'cascade' }),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  // Stop details
  locationName: text("location_name").notNull(), // e.g., "Memphis Hub", "Nashville Meetup"
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  latitude: text("latitude"),
  longitude: text("longitude"),
  // Destination organization (if this is a drop-off for a receiving rescue)
  destinationOrgId: uuid("destination_org_id").references(() => tenants.id, { onDelete: 'set null' }),
  destinationOrgName: text("destination_org_name"),
  destinationContactName: text("destination_contact_name"),
  destinationContactPhone: text("destination_contact_phone"),
  destinationContactEmail: text("destination_contact_email"),
  // Schedule
  estimatedArrival: timestamp("estimated_arrival"),
  actualArrival: timestamp("actual_arrival"),
  estimatedDeparture: timestamp("estimated_departure"),
  actualDeparture: timestamp("actual_departure"),
  // Order in route
  orderIndex: integer("order_index").notNull().default(0), // 1st stop, 2nd stop, etc.
  // Stop type
  stopType: text("stop_type").notNull().default("dropoff").$type<"origin" | "pickup" | "dropoff" | "rest" | "fuel" | "handoff" | "destination">(),
  // Per-leg driver assignment (different driver for this leg of the journey)
  legDriverName: text("leg_driver_name"),
  legDriverPhone: text("leg_driver_phone"),
  legDriverEmail: text("leg_driver_email"),
  // Notes
  notes: text("notes"),
  // Status
  status: text("status").notNull().default("pending").$type<"pending" | "arrived" | "departed" | "skipped">(),
  // Arrival notification sent to receiving org
  arrivalNotificationSentAt: timestamp("arrival_notification_sent_at"),
  // Signature capture / Proof of Delivery
  signatureDataUrl: text("signature_data_url"), // Base64 signature image
  signedByName: text("signed_by_name"),
  signedAt: timestamp("signed_at"),
  deliveryLocationCoords: text("delivery_location_coords"), // "lat,lng" geolocation when signed
  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertTransportStopSchema = createInsertSchema(transportStops).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTransportStop = z.infer<typeof insertTransportStopSchema>;
export type TransportStop = typeof transportStops.$inferSelect;

// Transport Manifest Items table - animals on the transport with destination info
export const transportManifestItems = pgTable("transport_manifest_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  transportId: uuid("transport_id").notNull().references(() => transportEvents.id, { onDelete: 'cascade' }),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  // Animal being transported
  animalId: uuid("animal_id").notNull().references(() => animals.id, { onDelete: 'cascade' }),
  // Origin info (sender)
  originOrgId: uuid("origin_org_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  originOrgName: text("origin_org_name"),
  // Destination info (receiver) - which org will receive this animal
  destinationOrgId: uuid("destination_org_id").references(() => tenants.id, { onDelete: 'set null' }),
  destinationOrgName: text("destination_org_name"),
  // Which stop does this animal get dropped at?
  dropoffStopId: uuid("dropoff_stop_id").references(() => transportStops.id, { onDelete: 'set null' }),
  // Special instructions for driver
  specialInstructions: text("special_instructions"), // e.g., "Meds due at 8 AM", "Flight Risk"
  medicationSchedule: text("medication_schedule"),
  feedingSchedule: text("feeding_schedule"),
  behaviorNotes: text("behavior_notes"), // e.g., "Nervous traveler", "Needs quiet"
  // Special instruction flags (for visual icons)
  needsMedication: boolean("needs_medication").default(false), // "Needs Meds during trip" icon
  isFlightRisk: boolean("is_flight_risk").default(false), // "Do Not Walk (Flight Risk)" icon
  isAggressive: boolean("is_aggressive").default(false), // "Aggressive - Handle with Care" icon
  hasSpecialNeeds: boolean("has_special_needs").default(false), // General special needs flag
  // Document validation
  hasHealthCertificate: boolean("has_health_certificate").default(false),
  hasCvi: boolean("has_cvi").default(false), // Certificate of Veterinary Inspection
  healthCertificateDocId: uuid("health_certificate_doc_id"), // Link to document
  cviDocId: uuid("cvi_doc_id"),
  documentValidationErrors: text("document_validation_errors").array().default(sql`ARRAY[]::text[]`),
  // Delivery status
  isDelivered: boolean("is_delivered").default(false),
  deliveredAt: timestamp("delivered_at"),
  deliveryConfirmedBy: text("delivery_confirmed_by"),
  deliveryNotes: text("delivery_notes"),
  deliverySignatureUrl: text("delivery_signature_url"), // Base64 signature image for dropoff confirmation
  // Import status (for receiving org)
  importStatus: text("import_status").default("pending").$type<"pending" | "accepted" | "declined" | "imported">(),
  importedAt: timestamp("imported_at"),
  importedAnimalId: uuid("imported_animal_id"), // The new animal record created in receiver's org
  importedBy: uuid("imported_by").references(() => users.id, { onDelete: 'set null' }),
  importDeclineReason: text("import_decline_reason"),
  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertTransportManifestItemSchema = createInsertSchema(transportManifestItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTransportManifestItem = z.infer<typeof insertTransportManifestItemSchema>;
export type TransportManifestItem = typeof transportManifestItems.$inferSelect;

// Pending Transfers table - tracks transfers awaiting acceptance by receiving org
export const pendingTransfers = pgTable("pending_transfers", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Sender info
  senderTenantId: uuid("sender_tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  senderOrgName: text("sender_org_name").notNull(),
  senderContactName: text("sender_contact_name"),
  senderContactEmail: text("sender_contact_email"),
  // Receiver info
  receiverTenantId: uuid("receiver_tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  // Transport reference
  transportId: uuid("transport_id").references(() => transportEvents.id, { onDelete: 'set null' }),
  manifestItemId: uuid("manifest_item_id").references(() => transportManifestItems.id, { onDelete: 'cascade' }),
  // Animal info (snapshot at time of transfer)
  originalAnimalId: uuid("original_animal_id").notNull().references(() => animals.id, { onDelete: 'cascade' }),
  animalName: text("animal_name").notNull(),
  animalSpecies: text("animal_species"),
  animalBreed: text("animal_breed"),
  animalAge: text("animal_age"),
  animalPhotoUrl: text("animal_photo_url"),
  // Status
  status: text("status").notNull().default("pending").$type<"pending" | "accepted" | "declined" | "expired">(),
  // Import result
  importedAnimalId: uuid("imported_animal_id"), // The new animal record after import
  importedAt: timestamp("imported_at"),
  importedBy: uuid("imported_by").references(() => users.id, { onDelete: 'set null' }),
  declineReason: text("decline_reason"),
  // Expiration
  expiresAt: timestamp("expires_at"),
  // Notification tracking
  notificationSentAt: timestamp("notification_sent_at"),
  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPendingTransferSchema = createInsertSchema(pendingTransfers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPendingTransfer = z.infer<typeof insertPendingTransferSchema>;
export type PendingTransfer = typeof pendingTransfers.$inferSelect;

// SMS Proxy Sessions table - for foster/adopter privacy messaging
export const smsProxySessions = pgTable("sms_proxy_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  // Party A (Foster)
  partyAPhone: text("party_a_phone").notNull(), // Foster's real phone number
  partyAAlias: text("party_a_alias").notNull().default("Foster"), // Display name (e.g., "Foster Mom")
  partyAUserId: uuid("party_a_user_id").references(() => users.id, { onDelete: 'set null' }),
  // Party B (Adopter)
  partyBPhone: text("party_b_phone").notNull(), // Adopter's real phone number
  partyBAlias: text("party_b_alias").notNull().default("Adopter"), // Display name (e.g., "Potential Adopter")
  partyBContactId: uuid("party_b_contact_id").references(() => contacts.id, { onDelete: 'set null' }),
  // Session context
  animalId: uuid("animal_id").references(() => animals.id, { onDelete: 'set null' }),
  applicationId: uuid("application_id").references(() => applications.id, { onDelete: 'set null' }),
  // Status
  isActive: boolean("is_active").notNull().default(true),
  expiresAt: timestamp("expires_at"), // Optional expiration
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSmsProxySessionSchema = createInsertSchema(smsProxySessions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSmsProxySession = z.infer<typeof insertSmsProxySessionSchema>;
export type SmsProxySession = typeof smsProxySessions.$inferSelect;

// SMS Message Logs table - audit trail for all SMS communications
export const smsMessageLogs = pgTable("sms_message_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  // Message details
  twilioMessageSid: text("twilio_message_sid"), // Twilio message SID for tracking
  direction: text("direction").notNull().$type<"outbound" | "inbound">(),
  fromNumber: text("from_number").notNull(),
  toNumber: text("to_number").notNull(),
  body: text("body").notNull(),
  // Context
  messageType: text("message_type").notNull().$type<"transport_alert" | "proxy_message" | "broadcast" | "reminder" | "other">(),
  transportId: uuid("transport_id").references(() => transportEvents.id, { onDelete: 'set null' }),
  proxySessionId: uuid("proxy_session_id").references(() => smsProxySessions.id, { onDelete: 'set null' }),
  // Status
  status: text("status").notNull().default("sent").$type<"sent" | "delivered" | "failed" | "received">(),
  errorMessage: text("error_message"), // If failed
  // Metadata
  sentBy: uuid("sent_by").references(() => users.id, { onDelete: 'set null' }),
  sentByName: text("sent_by_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSmsMessageLogSchema = createInsertSchema(smsMessageLogs).omit({
  id: true,
  createdAt: true,
});
export type InsertSmsMessageLog = z.infer<typeof insertSmsMessageLogSchema>;
export type SmsMessageLog = typeof smsMessageLogs.$inferSelect;

// DocuSign Envelopes table - tracks adoption contracts sent for signature
export const docusignEnvelopes = pgTable("docusign_envelopes", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  // DocuSign envelope information
  envelopeId: text("envelope_id").notNull(), // DocuSign Envelope ID
  // Related records
  applicationId: uuid("application_id").notNull().references(() => applications.id, { onDelete: 'cascade' }),
  animalId: uuid("animal_id").notNull().references(() => animals.id, { onDelete: 'cascade' }),
  // Signer information
  signerEmail: text("signer_email").notNull(),
  signerName: text("signer_name").notNull(),
  // Status tracking
  status: text("status").notNull().default("sent").$type<"created" | "sent" | "delivered" | "signed" | "completed" | "declined" | "voided">(),
  sentAt: timestamp("sent_at").notNull().defaultNow(),
  viewedAt: timestamp("viewed_at"),
  signedAt: timestamp("signed_at"),
  completedAt: timestamp("completed_at"),
  // Document storage
  signedDocumentUrl: text("signed_document_url"), // URL to signed PDF in Google Drive
  signedDocumentId: text("signed_document_id"), // Google Drive file ID
  // Metadata
  contractTemplateId: uuid("contract_template_id"), // Optional reference to contract template used
  sentBy: uuid("sent_by").references(() => users.id, { onDelete: 'set null' }),
  sentByName: text("sent_by_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertDocusignEnvelopeSchema = createInsertSchema(docusignEnvelopes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertDocusignEnvelope = z.infer<typeof insertDocusignEnvelopeSchema>;
export type DocusignEnvelope = typeof docusignEnvelopes.$inferSelect;

// Newsletter Campaigns table - email campaign management with React Email templates
export const newsletterCampaigns = pgTable("newsletter_campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  // Campaign basics
  name: text("name").notNull(), // Internal name for the campaign
  subject: text("subject").notNull(), // Email subject line
  previewText: text("preview_text"), // Preview text shown in email clients
  // Template and content
  templateType: text("template_type").notNull().$type<"new_arrivals" | "success_stories" | "urgent_needs" | "monthly_roundup" | "event_announcement" | "custom">(),
  content: jsonb("content").$type<{
    // Shared fields
    headerTitle?: string;
    headerSubtitle?: string;
    introText?: string;
    ctaButtonText?: string;
    ctaButtonUrl?: string;
    footerText?: string;
    // Canva-designed graphics
    headerImageUrl?: string; // Custom header banner designed in Canva
    headerCanvaDesignId?: string; // Canva design ID for editing header
    heroImageUrl?: string; // Hero/feature image designed in Canva
    heroCanvaDesignId?: string; // Canva design ID for editing hero
    // New Arrivals specific
    animalIds?: string[]; // Selected animal IDs to feature
    // Success Stories specific  
    happyTailIds?: string[]; // Selected happy tail story IDs
    // Urgent Needs specific
    urgentAnimalId?: string; // Single animal for urgent appeal
    fundingGoal?: number;
    fundingRaised?: number;
    urgencyReason?: string;
    // Monthly Roundup specific
    statsMonth?: string; // e.g., "November 2024"
    adoptionCount?: number;
    rescueCount?: number;
    volunteerHours?: number;
    donationTotal?: number;
    spotlightVolunteer?: string;
    spotlightStory?: string;
    // Event Announcement specific
    eventId?: string; // Calendar event ID
    eventName?: string;
    eventDate?: string;
    eventTime?: string;
    eventLocation?: string;
    eventDescription?: string;
    eventImageUrl?: string;
    // Custom template
    customHtml?: string;
    sections?: Array<{
      type: "text" | "image" | "animals" | "cta" | "divider";
      content?: string;
      imageUrl?: string;
      animalIds?: string[];
      buttonText?: string;
      buttonUrl?: string;
    }>;
  }>(),
  // Status tracking
  status: text("status").notNull().default("draft").$type<"draft" | "scheduled" | "sending" | "sent" | "failed">(),
  scheduledFor: timestamp("scheduled_for"), // When to send (null = not scheduled)
  sentAt: timestamp("sent_at"), // When actually sent
  // Stats (updated after send)
  recipientCount: integer("recipient_count").default(0), // How many were sent
  openCount: integer("open_count").default(0), // Tracking opens (if implemented)
  clickCount: integer("click_count").default(0), // Tracking clicks (if implemented)
  // Audit
  createdBy: uuid("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertNewsletterCampaignSchema = createInsertSchema(newsletterCampaigns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertNewsletterCampaign = z.infer<typeof insertNewsletterCampaignSchema>;
export type NewsletterCampaign = typeof newsletterCampaigns.$inferSelect;

// Medical Import Batches table - stores AI parsing sessions for vet record uploads
export const medicalImportBatches = pgTable("medical_import_batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  animalId: uuid("animal_id").notNull().references(() => animals.id, { onDelete: 'cascade' }),
  // File info
  originalFileName: text("original_file_name").notNull(),
  fileUrl: text("file_url"), // Object storage URL
  fileSize: integer("file_size"), // Bytes
  pageCount: integer("page_count"),
  // Parsing status
  status: text("status").notNull().default("pending").$type<"pending" | "processing" | "review" | "partially_imported" | "completed" | "failed">(),
  errorMessage: text("error_message"),
  // Raw extracted text (for debugging/verification)
  extractedText: text("extracted_text"),
  // AI confidence info
  overallConfidence: numeric("overall_confidence", { precision: 5, scale: 2 }), // 0-100 scale
  processingNotes: text("processing_notes"), // AI notes about extraction quality
  // Audit
  createdBy: uuid("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: 'set null' }),
  reviewedAt: timestamp("reviewed_at"),
  completedAt: timestamp("completed_at"),
});

export const insertMedicalImportBatchSchema = createInsertSchema(medicalImportBatches).omit({
  id: true,
  createdAt: true,
});
export type InsertMedicalImportBatch = z.infer<typeof insertMedicalImportBatchSchema>;
export type MedicalImportBatch = typeof medicalImportBatches.$inferSelect;

// Medical Import Items table - individual extracted records awaiting approval
export const medicalImportItems = pgTable("medical_import_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  batchId: uuid("batch_id").notNull().references(() => medicalImportBatches.id, { onDelete: 'cascade' }),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  animalId: uuid("animal_id").notNull().references(() => animals.id, { onDelete: 'cascade' }),
  // Record type and status
  recordType: text("record_type").notNull().$type<"vaccine" | "procedure" | "prescription" | "diagnostic" | "exam">(),
  status: text("status").notNull().default("pending").$type<"pending" | "approved" | "rejected" | "modified">(),
  // Extracted data (JSON structure varies by recordType)
  extractedData: jsonb("extracted_data").notNull().$type<{
    // Vaccine fields
    itemName?: string;
    dateGiven?: string;
    dateDue?: string;
    manufacturer?: string;
    lotNumber?: string;
    administeredBy?: string;
    // Procedure fields
    procedureName?: string;
    procedureDate?: string;
    veterinarian?: string;
    notes?: string;
    // Prescription fields
    medicationName?: string;
    dosage?: string;
    route?: string;
    frequency?: string;
    startDate?: string;
    endDate?: string;
    // Diagnostic fields
    testName?: string;
    testDate?: string;
    result?: string;
    // Exam fields
    examType?: string;
    examDate?: string;
    performedBy?: string;
    subjective?: string;
    objective?: string;
    assessment?: string;
    plan?: string;
    weight?: string;
    temperature?: string;
  }>(),
  // AI confidence for this specific item
  confidence: numeric("confidence", { precision: 5, scale: 2 }), // 0-100 scale
  sourcePageNumber: integer("source_page_number"), // Which page the data came from
  sourceText: text("source_text"), // Original text snippet that was parsed
  // If modified by user before approval
  modifiedData: jsonb("modified_data").$type<Record<string, unknown>>(),
  // Link to created record (after approval)
  createdRecordId: uuid("created_record_id"), // ID of the vaccine/procedure/etc record created
  // Audit
  reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: 'set null' }),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertMedicalImportItemSchema = createInsertSchema(medicalImportItems).omit({
  id: true,
  createdAt: true,
});
export type InsertMedicalImportItem = z.infer<typeof insertMedicalImportItemSchema>;
export type MedicalImportItem = typeof medicalImportItems.$inferSelect;

// Activity Logs - Track all tenant-level user activities for admin visibility
export const activityLogs = pgTable("activity_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  userId: uuid("user_id").references(() => users.id, { onDelete: 'set null' }), // Who performed the action (null for system actions)
  entityType: text("entity_type").notNull(), // 'Animal', 'User', 'Medical', 'Adoption', 'Donation', 'Foster', 'Transport', etc.
  entityId: text("entity_id"), // ID of the affected record
  action: text("action").notNull(), // 'created', 'updated', 'deleted', 'login', 'logout', 'viewed', etc.
  description: text("description").notNull(), // Human-readable: "Added new dog 'Max' to the shelter"
  category: text("category").notNull().$type<"intake" | "medical" | "movement" | "adoption" | "finance" | "user" | "system">(), // For color-coding
  metadata: jsonb("metadata").$type<Record<string, any>>(), // Additional context like before/after values
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertActivityLogSchema = createInsertSchema(activityLogs).omit({
  id: true,
  createdAt: true,
});
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;
export type ActivityLog = typeof activityLogs.$inferSelect;

// ===== NONPROFIT COMPLIANCE TABLES =====

// SAC Standard Status Categories (for status mapping)
export const SAC_INTAKE_CATEGORIES = [
  'stray_at_large',
  'relinquished_by_owner',
  'owner_intended_euthanasia',
  'transferred_in',
  'other_intake'
] as const;
export type SacIntakeCategory = typeof SAC_INTAKE_CATEGORIES[number];

export const SAC_OUTCOME_CATEGORIES = [
  'adoption',
  'returned_to_owner',
  'transferred_out',
  'returned_to_field',
  'other_live_outcome',
  'died_in_care',
  'lost_in_care',
  'shelter_euthanasia',
  'owner_intended_euthanasia'
] as const;
export type SacOutcomeCategory = typeof SAC_OUTCOME_CATEGORIES[number];

// Compliance Documents table - stores 501c3, Form 990, Financials, Board List for Candid/GuideStar
export const complianceDocuments = pgTable("compliance_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  documentType: text("document_type").notNull().$type<"501c3_letter" | "form_990" | "audited_financials" | "board_list">(),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(), // Object storage URL
  fileSize: integer("file_size"), // Bytes
  fiscalYear: text("fiscal_year"), // e.g., "2023" for Form 990
  uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: 'set null' }),
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at"), // When document needs to be renewed (e.g., annual Form 990)
  isActive: boolean("is_active").notNull().default(true), // Allow marking old versions as inactive
}, (table) => ({
  uniqueActiveDoc: unique().on(table.tenantId, table.documentType, table.isActive),
}));

export const insertComplianceDocumentSchema = createInsertSchema(complianceDocuments).omit({
  id: true,
  uploadedAt: true,
});
export type InsertComplianceDocument = z.infer<typeof insertComplianceDocumentSchema>;
export type ComplianceDocument = typeof complianceDocuments.$inferSelect;

// SAC Monthly Reports table - tracks generated Shelter Animals Count exports
export const sacMonthlyReports = pgTable("sac_monthly_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  reportMonth: integer("report_month").notNull(), // 1-12
  reportYear: integer("report_year").notNull(), // e.g., 2024
  // Beginning/ending counts by species and age group
  statistics: jsonb("statistics").notNull().$type<{
    dogs: {
      juvenile: { beginning: number; intakes: number; outcomes: number; ending: number };
      adult: { beginning: number; intakes: number; outcomes: number; ending: number };
    };
    cats: {
      juvenile: { beginning: number; intakes: number; outcomes: number; ending: number };
      adult: { beginning: number; intakes: number; outcomes: number; ending: number };
    };
    other: {
      beginning: number; intakes: number; outcomes: number; ending: number;
    };
    // Detailed breakdowns for SAC matrix
    intakeBreakdown?: Record<string, number>; // By intake category
    outcomeBreakdown?: Record<string, number>; // By outcome category
  }>(),
  // Validation status
  validationStatus: text("validation_status").notNull().default("pending").$type<"pending" | "valid" | "errors">(),
  validationErrors: jsonb("validation_errors").$type<Array<{
    field: string;
    message: string;
    animalIds?: string[];
  }>>(),
  // Export
  csvUrl: text("csv_url"), // Object storage URL for generated CSV
  generatedAt: timestamp("generated_at"),
  generatedBy: uuid("generated_by").references(() => users.id, { onDelete: 'set null' }),
  // Audit
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  uniqueMonthYear: unique().on(table.tenantId, table.reportMonth, table.reportYear),
}));

export const insertSacMonthlyReportSchema = createInsertSchema(sacMonthlyReports).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSacMonthlyReport = z.infer<typeof insertSacMonthlyReportSchema>;
export type SacMonthlyReport = typeof sacMonthlyReports.$inferSelect;

// Impact Stats table - stores nightly calculated Live Release Rate for Charity Navigator
export const impactStats = pgTable("impact_stats", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  periodStart: timestamp("period_start").notNull(), // Start of calculation period
  periodEnd: timestamp("period_end").notNull(), // End of calculation period (usually yesterday)
  periodType: text("period_type").notNull().default("rolling_12_months").$type<"monthly" | "quarterly" | "annual" | "rolling_12_months">(),
  // Asilomar Accords Live Release Rate calculation
  liveOutcomes: integer("live_outcomes").notNull(), // Adoptions + Returns to Owner + Transfers Out + Return to Field
  totalOutcomes: integer("total_outcomes").notNull(), // All outcomes
  ownerRequestedEuthanasia: integer("owner_requested_euthanasia").notNull().default(0), // ORE count (may be excluded)
  excludedOre: boolean("excluded_ore").notNull().default(false), // Whether ORE was excluded from denominator
  liveReleaseRate: numeric("live_release_rate", { precision: 5, scale: 2 }).notNull(), // Calculated LRR (0-100)
  // Additional metrics for transparency
  totalIntakes: integer("total_intakes"),
  adoptionsCount: integer("adoptions_count"),
  transfersOutCount: integer("transfers_out_count"),
  returnedToOwnerCount: integer("returned_to_owner_count"),
  euthanasiaCount: integer("euthanasia_count"),
  diedInCareCount: integer("died_in_care_count"),
  // Audit
  computedAt: timestamp("computed_at").notNull().defaultNow(),
});

export const insertImpactStatSchema = createInsertSchema(impactStats).omit({
  id: true,
  computedAt: true,
});
export type InsertImpactStat = z.infer<typeof insertImpactStatSchema>;
export type ImpactStat = typeof impactStats.$inferSelect;

// Review Requests table - tracks GreatNonprofits review request automation
export const reviewRequests = pgTable("review_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  animalId: uuid("animal_id").notNull().references(() => animals.id, { onDelete: 'cascade' }),
  adopterContactId: uuid("adopter_contact_id").references(() => contacts.id, { onDelete: 'set null' }),
  adopterEmail: text("adopter_email").notNull(),
  adopterName: text("adopter_name"),
  animalName: text("animal_name").notNull(), // Cached for email personalization
  // Scheduling
  adoptedAt: timestamp("adopted_at").notNull(), // When the adoption was finalized
  scheduledFor: timestamp("scheduled_for").notNull(), // When to send the review request (adopted_at + delay days)
  // Status tracking
  status: text("status").notNull().default("pending").$type<"pending" | "sent" | "failed" | "cancelled">(),
  sentAt: timestamp("sent_at"),
  failureReason: text("failure_reason"),
  emailId: text("email_id"), // Resend email ID for tracking
  // Audit
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertReviewRequestSchema = createInsertSchema(reviewRequests).omit({
  id: true,
  createdAt: true,
});
export type InsertReviewRequest = z.infer<typeof insertReviewRequestSchema>;
export type ReviewRequest = typeof reviewRequests.$inferSelect;

// ============================================
// GOVEE TEMPERATURE MONITORING INTEGRATION
// ============================================

// Govee Credentials table - encrypted API keys per tenant
export const goveeCredentials = pgTable("govee_credentials", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }).unique(),
  encryptedApiKey: text("encrypted_api_key").notNull(), // AES-256-GCM encrypted
  accountEmail: text("account_email"), // Optional: Govee account email for reference
  status: text("status").notNull().default("active").$type<"active" | "invalid" | "rate_limited" | "disconnected">(),
  lastSyncAt: timestamp("last_sync_at"),
  lastSyncError: text("last_sync_error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertGoveeCredentialSchema = createInsertSchema(goveeCredentials).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertGoveeCredential = z.infer<typeof insertGoveeCredentialSchema>;
export type GoveeCredential = typeof goveeCredentials.$inferSelect;

// Govee Devices table - registered temperature sensors per tenant
export const goveeDevices = pgTable("govee_devices", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  goveeDeviceId: text("govee_device_id").notNull(), // Govee's device identifier
  model: text("model").notNull(), // Device model (e.g., H5075, H5179)
  deviceName: text("device_name").notNull(), // Name from Govee app
  locationLabel: text("location_label"), // Custom label (e.g., "Main Kennel", "Isolation Room")
  isEnabled: boolean("is_enabled").notNull().default(true), // Whether to poll this device
  pollingIntervalMinutes: integer("polling_interval_minutes").notNull().default(10), // Override polling frequency
  batteryLevel: integer("battery_level"), // 0-100, null for AC-powered devices
  isOnline: boolean("is_online").notNull().default(true),
  lastReadingAt: timestamp("last_reading_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  uniqueDevice: unique().on(table.tenantId, table.goveeDeviceId),
}));

export const insertGoveeDeviceSchema = createInsertSchema(goveeDevices).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertGoveeDevice = z.infer<typeof insertGoveeDeviceSchema>;
export type GoveeDevice = typeof goveeDevices.$inferSelect;

// Govee Readings table - temperature/humidity time series data
export const goveeReadings = pgTable("govee_readings", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  deviceId: uuid("device_id").notNull().references(() => goveeDevices.id, { onDelete: 'cascade' }),
  recordedAt: timestamp("recorded_at").notNull().defaultNow(),
  temperatureCelsius: numeric("temperature_celsius", { precision: 5, scale: 2 }).notNull(),
  temperatureFahrenheit: numeric("temperature_fahrenheit", { precision: 5, scale: 2 }).notNull(),
  humidityPercent: numeric("humidity_percent", { precision: 5, scale: 2 }),
  batteryLevel: integer("battery_level"),
});

export const insertGoveeReadingSchema = createInsertSchema(goveeReadings).omit({
  id: true,
});
export type InsertGoveeReading = z.infer<typeof insertGoveeReadingSchema>;
export type GoveeReading = typeof goveeReadings.$inferSelect;

// Govee Alert Rules table - temperature thresholds and notification preferences
export const goveeAlertRules = pgTable("govee_alert_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  deviceId: uuid("device_id").references(() => goveeDevices.id, { onDelete: 'cascade' }), // null = applies to all devices
  name: text("name").notNull(), // e.g., "Kennel Temperature Alert"
  isEnabled: boolean("is_enabled").notNull().default(true),
  // Temperature thresholds (Fahrenheit)
  minTemperatureF: numeric("min_temperature_f", { precision: 5, scale: 2 }), // Alert if below this
  maxTemperatureF: numeric("max_temperature_f", { precision: 5, scale: 2 }), // Alert if above this
  // Humidity thresholds
  minHumidityPercent: numeric("min_humidity_percent", { precision: 5, scale: 2 }),
  maxHumidityPercent: numeric("max_humidity_percent", { precision: 5, scale: 2 }),
  // Notification preferences
  notifyEmail: boolean("notify_email").notNull().default(true),
  notifySms: boolean("notify_sms").notNull().default(false),
  notificationEmails: text("notification_emails").array(), // Override recipient emails
  notificationPhones: text("notification_phones").array(), // Override recipient phone numbers
  // Cooldown to prevent alert spam
  cooldownMinutes: integer("cooldown_minutes").notNull().default(30),
  lastTriggeredAt: timestamp("last_triggered_at"),
  // Quiet hours (don't send alerts during these hours)
  quietHoursStart: text("quiet_hours_start"), // e.g., "22:00"
  quietHoursEnd: text("quiet_hours_end"), // e.g., "07:00"
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertGoveeAlertRuleSchema = createInsertSchema(goveeAlertRules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertGoveeAlertRule = z.infer<typeof insertGoveeAlertRuleSchema>;
export type GoveeAlertRule = typeof goveeAlertRules.$inferSelect;

// Govee Alert Events table - triggered alert history for audit
export const goveeAlertEvents = pgTable("govee_alert_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  ruleId: uuid("rule_id").notNull().references(() => goveeAlertRules.id, { onDelete: 'cascade' }),
  deviceId: uuid("device_id").notNull().references(() => goveeDevices.id, { onDelete: 'cascade' }),
  readingId: uuid("reading_id").references(() => goveeReadings.id, { onDelete: 'set null' }),
  // Alert details
  alertType: text("alert_type").notNull().$type<"temp_low" | "temp_high" | "humidity_low" | "humidity_high" | "device_offline">(),
  triggerValue: numeric("trigger_value", { precision: 5, scale: 2 }), // The value that triggered the alert
  thresholdValue: numeric("threshold_value", { precision: 5, scale: 2 }), // The threshold that was breached
  message: text("message").notNull(), // Human-readable alert message
  // Notification status
  emailSent: boolean("email_sent").notNull().default(false),
  smsSent: boolean("sms_sent").notNull().default(false),
  emailRecipients: text("email_recipients").array(),
  smsRecipients: text("sms_recipients").array(),
  // Status
  status: text("status").notNull().default("triggered").$type<"triggered" | "acknowledged" | "resolved">(),
  acknowledgedAt: timestamp("acknowledged_at"),
  acknowledgedBy: uuid("acknowledged_by").references(() => users.id, { onDelete: 'set null' }),
  resolvedAt: timestamp("resolved_at"),
  triggeredAt: timestamp("triggered_at").notNull().defaultNow(),
});

export const insertGoveeAlertEventSchema = createInsertSchema(goveeAlertEvents).omit({
  id: true,
  triggeredAt: true,
});
export type InsertGoveeAlertEvent = z.infer<typeof insertGoveeAlertEventSchema>;
export type GoveeAlertEvent = typeof goveeAlertEvents.$inferSelect;

// ============================================================================
// Broadcast Notifications - Push & SMS alerts to volunteers/staff
// ============================================================================

// Broadcast Templates - Pre-defined message templates for common alerts
export const broadcastTemplates = pgTable("broadcast_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: text("name").notNull(), // e.g., "Urgent Foster Need", "Weather Closure"
  category: text("category").notNull().$type<"urgent" | "event" | "reminder" | "general">(),
  subject: text("subject").notNull(), // Title/subject for push notification
  body: text("body").notNull(), // Message body (can include {variables})
  channels: text("channels").array().notNull().$type<("push" | "sms" | "email")[]>(),
  targetRoles: text("target_roles").array().$type<("admin" | "board_member" | "staff" | "foster" | "volunteer")[]>(),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertBroadcastTemplateSchema = createInsertSchema(broadcastTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertBroadcastTemplate = z.infer<typeof insertBroadcastTemplateSchema>;
export type BroadcastTemplate = typeof broadcastTemplates.$inferSelect;

// Broadcasts - Sent broadcast messages
export const broadcasts = pgTable("broadcasts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  templateId: uuid("template_id").references(() => broadcastTemplates.id, { onDelete: 'set null' }),
  title: text("title").notNull(), // Notification title
  message: text("message").notNull(), // Message body
  channels: text("channels").array().notNull().$type<("push" | "sms" | "email")[]>(),
  targetRoles: text("target_roles").array().$type<("admin" | "board_member" | "staff" | "foster" | "volunteer")[]>(),
  targetUserIds: text("target_user_ids").array(), // Specific users (if not role-based)
  // Delivery stats
  totalRecipients: integer("total_recipients").notNull().default(0),
  pushSent: integer("push_sent").notNull().default(0),
  pushFailed: integer("push_failed").notNull().default(0),
  smsSent: integer("sms_sent").notNull().default(0),
  smsFailed: integer("sms_failed").notNull().default(0),
  emailSent: integer("email_sent").notNull().default(0),
  emailFailed: integer("email_failed").notNull().default(0),
  // Status
  status: text("status").notNull().default("pending").$type<"pending" | "sending" | "sent" | "partial" | "failed">(),
  scheduledFor: timestamp("scheduled_for"), // For scheduled broadcasts
  sentAt: timestamp("sent_at"),
  sentBy: uuid("sent_by").references(() => users.id, { onDelete: 'set null' }),
  sentByName: text("sent_by_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertBroadcastSchema = createInsertSchema(broadcasts).omit({
  id: true,
  createdAt: true,
});
export type InsertBroadcast = z.infer<typeof insertBroadcastSchema>;
export type Broadcast = typeof broadcasts.$inferSelect;

// Broadcast Recipients - Individual delivery tracking
export const broadcastRecipients = pgTable("broadcast_recipients", {
  id: uuid("id").primaryKey().defaultRandom(),
  broadcastId: uuid("broadcast_id").notNull().references(() => broadcasts.id, { onDelete: 'cascade' }),
  userId: uuid("user_id").references(() => users.id, { onDelete: 'set null' }),
  userName: text("user_name"),
  userEmail: text("user_email"),
  userPhone: text("user_phone"),
  // Delivery status per channel
  pushStatus: text("push_status").$type<"pending" | "sent" | "failed" | "not_subscribed">(),
  pushSentAt: timestamp("push_sent_at"),
  pushError: text("push_error"),
  smsStatus: text("sms_status").$type<"pending" | "sent" | "failed" | "no_phone">(),
  smsSentAt: timestamp("sms_sent_at"),
  smsError: text("sms_error"),
  smsSid: text("sms_sid"), // Twilio message SID
  emailStatus: text("email_status").$type<"pending" | "sent" | "failed" | "no_email">(),
  emailSentAt: timestamp("email_sent_at"),
  emailError: text("email_error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertBroadcastRecipientSchema = createInsertSchema(broadcastRecipients).omit({
  id: true,
  createdAt: true,
});
export type InsertBroadcastRecipient = z.infer<typeof insertBroadcastRecipientSchema>;
export type BroadcastRecipient = typeof broadcastRecipients.$inferSelect;

// Volunteer Threshold Alerts - Settings for minimum volunteer notifications
export const volunteerThresholdAlerts = pgTable("volunteer_threshold_alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: text("name").notNull(), // Alert name (e.g., "Weekend Coverage Alert")
  isEnabled: boolean("is_enabled").notNull().default(true),
  // Threshold settings
  minimumVolunteers: integer("minimum_volunteers").notNull().default(2),
  daysAhead: integer("days_ahead").notNull().default(3), // How many days ahead to check
  // Notification channels
  pushEnabled: boolean("push_enabled").notNull().default(true),
  smsEnabled: boolean("sms_enabled").notNull().default(false),
  emailEnabled: boolean("email_enabled").notNull().default(true),
  // Targeting
  targetAllVolunteers: boolean("target_all_volunteers").notNull().default(true),
  targetRoles: text("target_roles").array().$type<("admin" | "staff" | "volunteer" | "foster" | "board_member")[]>(),
  // Calendar/opportunity filtering (optional - can apply to specific calendars)
  calendarIds: text("calendar_ids").array(), // If empty, applies to all volunteer calendars
  // Notification timing
  checkTime: text("check_time").notNull().default("09:00"), // Time of day to check (24h format)
  daysOfWeek: text("days_of_week").array().notNull().$type<("sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat")[]>().default(["mon", "tue", "wed", "thu", "fri"]),
  // Custom message template
  messageTemplate: text("message_template"), // Custom notification message
  // Tracking
  lastCheckedAt: timestamp("last_checked_at"),
  lastAlertSentAt: timestamp("last_alert_sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertVolunteerThresholdAlertSchema = createInsertSchema(volunteerThresholdAlerts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastCheckedAt: true,
  lastAlertSentAt: true,
});
export type InsertVolunteerThresholdAlert = z.infer<typeof insertVolunteerThresholdAlertSchema>;
export type VolunteerThresholdAlert = typeof volunteerThresholdAlerts.$inferSelect;

// Volunteer Threshold Alert History - Log of sent alerts
export const volunteerThresholdAlertHistory = pgTable("volunteer_threshold_alert_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  alertId: uuid("alert_id").notNull().references(() => volunteerThresholdAlerts.id, { onDelete: 'cascade' }),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  alertDate: timestamp("alert_date").notNull(), // The date that triggered the alert
  opportunityId: uuid("opportunity_id").references(() => volunteerOpportunities.id, { onDelete: 'set null' }),
  opportunityTitle: text("opportunity_title"),
  currentVolunteers: integer("current_volunteers").notNull(),
  minimumRequired: integer("minimum_required").notNull(),
  // Delivery stats
  pushSent: integer("push_sent").notNull().default(0),
  smsSent: integer("sms_sent").notNull().default(0),
  emailSent: integer("email_sent").notNull().default(0),
  totalRecipients: integer("total_recipients").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertVolunteerThresholdAlertHistorySchema = createInsertSchema(volunteerThresholdAlertHistory).omit({
  id: true,
  createdAt: true,
});
export type InsertVolunteerThresholdAlertHistory = z.infer<typeof insertVolunteerThresholdAlertHistorySchema>;
export type VolunteerThresholdAlertHistory = typeof volunteerThresholdAlertHistory.$inferSelect;

// Gmail Send Logs - Track Gmail API sends for 24-hour rolling window limit (2,000/day for Workspace)
export const gmailSendLogs = pgTable("gmail_send_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  recipientEmail: text("recipient_email").notNull(),
  recipientCount: integer("recipient_count").notNull().default(1), // For batch sends with multiple recipients
  messageId: text("message_id"), // Gmail message ID if available
  purpose: text("purpose").$type<"newsletter" | "notification" | "transactional" | "campaign" | "other">().default("other"),
  sentAt: timestamp("sent_at").notNull().defaultNow(),
});

export const insertGmailSendLogSchema = createInsertSchema(gmailSendLogs).omit({
  id: true,
  sentAt: true,
});
export type InsertGmailSendLog = z.infer<typeof insertGmailSendLogSchema>;
export type GmailSendLog = typeof gmailSendLogs.$inferSelect;

// Newsletter Batch Schedule - For campaigns that need to be sent over multiple days
export const newsletterBatchSchedule = pgTable("newsletter_batch_schedule", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id").notNull().references(() => newsletterCampaigns.id, { onDelete: 'cascade' }),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  batchNumber: integer("batch_number").notNull(), // 1, 2, 3, etc.
  subscriberIds: text("subscriber_ids").array().notNull(), // UUIDs of subscribers in this batch
  recipientCount: integer("recipient_count").notNull(),
  scheduledFor: timestamp("scheduled_for").notNull(), // When this batch should be sent
  status: text("status").notNull().default("pending").$type<"pending" | "sending" | "sent" | "failed" | "cancelled">(),
  sentAt: timestamp("sent_at"),
  successCount: integer("success_count"),
  errorCount: integer("error_count"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertNewsletterBatchScheduleSchema = createInsertSchema(newsletterBatchSchedule).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  sentAt: true,
  successCount: true,
  errorCount: true,
});
export type InsertNewsletterBatchSchedule = z.infer<typeof insertNewsletterBatchScheduleSchema>;
export type NewsletterBatchSchedule = typeof newsletterBatchSchedule.$inferSelect;


// Tutorials - Help videos for tenants
export const tutorials = pgTable("tutorials", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: 'cascade' }),
  title: text("title").notNull(),
  description: text("description"),
  youtubeUrl: text("youtube_url").notNull(),
  category: text("category").notNull().$type<"getting-started" | "animals" | "medical" | "fosters" | "volunteers" | "communications" | "finance" | "website" | "settings" | "other">(),
  sortOrder: integer("sort_order").notNull().default(0),
  isGlobal: boolean("is_global").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertTutorialSchema = createInsertSchema(tutorials).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTutorial = z.infer<typeof insertTutorialSchema>;
export type Tutorial = typeof tutorials.$inferSelect;
