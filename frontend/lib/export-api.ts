/**
 * Types shared between the reports page and its sub-components.
 * API calls go through lib/api.ts (single ingress for all data fetching).
 */

export type Stream = "voc" | "comp" | "jrn" | "system";
export type ReportStatus = "ready" | "generating" | "scheduled";

export interface BriefingHighlight {
  stream: Exclude<Stream, "system">;
  text: string;
}

export interface Briefing {
  id: string;
  week_label: string;
  generated_at: string;
  status: ReportStatus;
  summary: string;
  highlights: BriefingHighlight[];
  stats: { pages: number; sources: number; signals: number; period: string };
  volume: { day: string; signals: number }[];
  delivery: { name: string; role: string; channel: string }[];
  next_send: string;
}

export interface PdfRef {
  s3_key: string;
  url: string;
}
