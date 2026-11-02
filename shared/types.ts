export type TaskStatus =
  | "QUEUED"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "AWAITING_APPROVAL";

export type TaskType = "PROSPECT_RESEARCH" | "OUTREACH_DRAFT";

export type TaskEventKind = "STATUS" | "PROGRESS" | "LOG" | "DELIVERY" | "ERROR";

export interface TaskEvent {
  id: string;
  at: string;
  kind: TaskEventKind;
  message: string;
  status?: TaskStatus;
}

export interface ResearchInput {
  city: string;
  category: "cafe" | "restaurant" | "bakery";
  count: number;
}

export interface SourceReference {
  id: string;
  kind: "OPENSTREETMAP" | "NOMINATIM" | "WEBSITE" | "HTTP_HEADER" | "SYSTEM";
  title: string;
  url: string;
  publisher: string;
  retrievedAt: string;
  excerpt: string;
  contentHash?: string;
}

export interface Location {
  address: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
}

export interface WebsiteAudit {
  viewport: boolean;
  metaDescription: string | null;
  h1: string | null;
  socialLinks: string[];
  bookingLinks: string[];
  structuredData: boolean;
  copyrightYear: number | null;
  generator: string | null;
  forms: number;
  phoneLinks: number;
  pageBytes: number;
  contentType: string | null;
  serverHeader: string | null;
  titleMatch: "STRONG" | "PARTIAL" | "NONE";
}

export interface WebsiteFinding {
  url: string | null;
  domain: string | null;
  verification: "PAGE_VERIFIED" | "TAG_ONLY" | "UNREACHABLE" | "NOT_PROVIDED";
  httpStatus: number | null;
  finalUrl: string | null;
  https: boolean;
  title: string | null;
  description: string | null;
  responseMs: number | null;
  contentHash: string | null;
  audit: WebsiteAudit | null;
  notes: string[];
}

export type OpportunityLevel = "HIGH" | "MEDIUM" | "LOW";

export interface OpportunitySignal {
  code: string;
  label: string;
  impact: number;
  evidence: string;
  sourceRefs: string[];
}

export interface Opportunity {
  level: OpportunityLevel;
  score: number;
  summary: string;
  signals: OpportunitySignal[];
}

export interface ResearchFact {
  statement: string;
  sourceRefs: string[];
}

export interface Prospect {
  id: string;
  rank: number;
  businessName: string;
  category: string;
  location: Location;
  osm: {
    type: string;
    id: number;
    url: string;
  };
  website: WebsiteFinding;
  opportunity: Opportunity;
  facts: ResearchFact[];
  assumptions: string[];
  sources: SourceReference[];
  researchTimestamp: string;
}

export interface ResearchResult {
  assignment: {
    city: string;
    category: string;
    requestedCount: number;
    deliveredCount: number;
  };
  prospects: Prospect[];
  methodology: string[];
  limitations: string[];
  sources: SourceReference[];
  executedAt: string;
  provider: string;
  candidatesExamined: number;
  websitesAudited: number;
}

export interface OutreachDraftResult {
  prospectId: string;
  businessName: string;
  draft: {
    subject: string;
    body: string;
    channel: "email";
  };
  approval: {
    status: "PENDING" | "APPROVED" | "REJECTED";
    requestedAt: string;
    decidedAt: string | null;
    note: string | null;
  };
  sent: false;
  note: string;
}

export interface DeliveryProof {
  persisted: boolean;
  persistedAt: string | null;
  readbackVerified: boolean;
  verifiedAt: string | null;
  broadcastClients: number;
  apiPath: string;
}

export interface TaskError {
  code: string;
  message: string;
  detail: string | null;
  at: string;
  retryable: boolean;
}

export interface Task {
  id: string;
  type: TaskType;
  title: string;
  brief: string;
  input: ResearchInput | { prospectId: string; parentTaskId: string };
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  progress: {
    stage: string;
    message: string;
    percent: number;
  };
  events: TaskEvent[];
  execution: {
    provider: string;
    mode: "LIVE" | "TEST";
    attemptedPasses: number;
  };
  result: ResearchResult | OutreachDraftResult | null;
  error: TaskError | null;
  approval: {
    status: "PENDING" | "APPROVED" | "REJECTED";
    requestedAt: string;
    decidedAt: string | null;
    note: string | null;
    scope: string;
  } | null;
  delivery: DeliveryProof;
}

export interface CreateResearchRequest {
  city: string;
  category: "cafe" | "restaurant" | "bakery";
  count?: number;
}

export interface CreateOutreachRequest {
  parentTaskId: string;
  prospectId: string;
}

export interface DecisionRequest {
  decision: "APPROVE" | "REJECT";
  note?: string;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    detail?: string | null;
  };
}

export interface SystemStatus {
  mode: "LIVE";
  version: string;
  startedAt: string;
  researchProvider: string;
  approvalPolicy: string;
  connectedClients: number;
  taskCounts: Record<TaskStatus, number>;
  capabilities: Array<{
    id: string;
    label: string;
    status: "LIVE" | "STANDBY" | "BLOCKED";
    detail: string;
  }>;
}
