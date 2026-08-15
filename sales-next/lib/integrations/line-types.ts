export interface LineCrmSnapshot {
  company: string | null;
  contactName: string | null;
  customerType: string | null;
  plan: string | null;
  need: string | null;
  budget: string | null;
  stage: string | null;
  timeline: string | null;
  objection: string | null;
  decisionMaker: string | null;
  nextAction: string | null;
  followUpDate: string | null;
  quotes: string[];
}

export interface LineIntegrationRecord {
  id: string;
  customerKey: string;
  company: string;
  assigned: boolean;
  receivedAt: string;
  transcript: string;
  crm: LineCrmSnapshot;
}

export interface LineIntegrationStatus {
  configured: boolean;
  connected: boolean;
  requiresAccessCode: boolean;
  accountName: string;
  customerCount: number;
  recordCount: number;
  unassignedCount: number;
  lastMessageAt: string | null;
  error?: string;
}

export interface LineRecordsResponse {
  status: LineIntegrationStatus;
  records: LineIntegrationRecord[];
}
