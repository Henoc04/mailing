// Shared entity/enum types matching backend/prisma/schema.prisma and the DTOs
// in backend/src/dto/*.dto.ts exactly (field names/casing matter — these are
// consumed by every *.api.ts module).

export type Role = "ADMIN" | "USER";

export type SmtpSecurity = "NONE" | "SSL" | "STARTTLS";

export type CampaignStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "SENDING"
  | "PAUSED"
  | "COMPLETED"
  | "CANCELLED"
  | "FAILED";

export type RecipientStatus = "PENDING" | "SENDING" | "SENT" | "FAILED" | "CANCELLED";

export type TrackingEventType = "OPEN" | "CLICK";

export type SegmentFilterMode = "AND" | "OR";

export type CampaignTargetType = "SINGLE" | "SEGMENTS" | "ALL";

export type Genre = "HOMME" | "FEMME" | "AUTRE";

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface Tag {
  id: string;
  ownerId: string;
  name: string;
  color: string | null;
  createdAt: string;
}

export interface Contact {
  id: string;
  ownerId: string;
  prenom: string | null;
  nom: string;
  genre: Genre | null;
  email: string;
  entreprise: string | null;
  fonction: string | null;
  telephone: string | null;
  adresse: string | null;
  codePostal: string | null;
  ville: string | null;
  departement: string | null;
  region: string | null;
  pays: string | null;
  siteWeb: string | null;
  notes: string | null;
  isUnsubscribed: boolean;
  unsubscribedAt: string | null;
  // Set when an SMTP server permanently rejected the address; excluded from campaigns.
  bouncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContactWithTags extends Contact {
  tags: Tag[];
}

// SmtpAccount as returned by the API — the backend NEVER returns
// `encryptedPassword`, so it is intentionally absent from this type.
export interface SmtpAccount {
  id: string;
  ownerId: string;
  label: string;
  host: string;
  port: number;
  security: SmtpSecurity;
  username: string;
  fromEmail: string;
  fromName: string;
  rotationGroup: string | null;
  isActive: boolean;
  dailyQuota: number | null;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  lastTestError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SegmentFilterRule {
  field: string;
  operator: string;
  value: unknown;
}

export interface Segment {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  filterMode: SegmentFilterMode;
  filterJson: SegmentFilterRule[];
  createdAt: string;
  updatedAt: string;
}

export interface Template {
  id: string;
  ownerId: string;
  name: string;
  subject: string;
  bodyHtml: string;
  bodyText: string | null;
  isDraft: boolean;
  createdAt: string;
  updatedAt: string;
  attachments?: Attachment[];
}

export interface Attachment {
  id: string;
  campaignId: string | null;
  templateId: string | null;
  fileName: string;
  storedPath: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface Campaign {
  id: string;
  ownerId: string;
  name: string;
  templateId: string | null;
  template?: Template | null;
  subjectOverride: string | null;
  status: CampaignStatus;
  /** Set when the send worker paused the campaign on its own. */
  pauseReason?: string | null;

  targetType: CampaignTargetType;
  targetContactId: string | null;
  segments?: Segment[];
  tags?: Tag[];

  smtpAccounts?: SmtpAccount[];
  useRotation: boolean;

  baseDelayMs: number;
  jitterMs: number;
  maxPerMinute: number | null;
  maxPerHour: number | null;
  maxRetries: number;

  scheduledAt: string | null;
  recurrenceRule: string | null;
  startedAt: string | null;
  completedAt: string | null;

  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  openedCount: number;
  clickedCount: number;

  createdAt: string;
  updatedAt: string;

  attachments?: Attachment[];
}

export interface CampaignRecipient {
  id: string;
  campaignId: string;
  contactId: string;
  mergeDataJson: Record<string, unknown>;
  status: RecipientStatus;
  attempts: number;
  nextAttemptAt: string;
  smtpAccountId: string | null;
  errorMessage: string | null;
  sentAt: string | null;
  durationMs: number | null;
  trackingToken: string;
  createdAt: string;
  updatedAt: string;
}

export interface SendLog {
  id: string;
  campaignId: string;
  smtpAccountId: string | null;
  recipientEmail: string;
  subject: string;
  status: RecipientStatus;
  errorMessage: string | null;
  durationMs: number | null;
  sentAt: string;
}

export interface TrackingEvent {
  id: string;
  campaignId: string;
  campaignRecipientId: string;
  type: TrackingEventType;
  url: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  occurredAt: string;
}

// "Brouillons" is a virtual list, not its own table: it surfaces campaigns
// with status DRAFT and templates with isDraft=true side by side.
export interface Draft {
  id: string;
  type: "CAMPAIGN" | "TEMPLATE";
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metaJson: unknown;
  ipAddress: string | null;
  createdAt: string;
}

// Paginated list envelope used by the `contacts` and `audit-log` list
// endpoints only — every other listing endpoint (segments, templates,
// campaigns, smtp-accounts, drafts, tags, users) returns a bare array.
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuditLogListResult {
  items: AuditLog[];
  total: number;
}

// Shape of the JSON body returned by backend/src/middleware/errorHandler.middleware.ts
export interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string;
  details?: unknown;
  stack?: string;
}

export interface RecentCampaignSummary {
  id: string;
  name: string;
  status: CampaignStatus;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  openedCount: number;
  clickedCount: number;
  createdAt: string;
}

export interface DashboardSummary {
  totalSent: number;
  totalFailed: number;
  totalOpened: number;
  totalClicked: number;
  activeCampaigns: number;
  totalContacts: number;
  recentCampaigns: RecentCampaignSummary[];
}

export interface CampaignProgress {
  status: CampaignStatus;
  pauseReason?: string | null;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  openedCount: number;
  clickedCount: number;
  startedAt: string | null;
  completedAt: string | null;
}
