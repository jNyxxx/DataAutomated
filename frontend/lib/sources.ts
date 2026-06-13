// Shared types and display metadata for data source components.
// Type DataSource mirrors the backend data_sources table.

export type ConnectionStatus =
  | 'active'
  | 'pending_configuration'
  | 'testing'
  | 'failed'
  | 'disconnected';

export interface DataSource {
  id: string;
  source_type: string;
  connection_status: ConnectionStatus;
  last_synced_at: string | null;
  is_active: boolean;
  connection_error?: string | null;
  config?: Record<string, unknown>;
}

export const SOURCE_LABELS: Record<string, string> = {
  zendesk: 'Zendesk',
  typeform: 'Typeform',
  intercom: 'Intercom',
  g2: 'G2',
  capterra: 'Capterra',
  news: 'News / SerpAPI',
  linkedin: 'LinkedIn Jobs',
  mixpanel: 'Mixpanel',
  segment: 'Segment',
  shopify: 'Shopify',
};

export const SOURCE_ICONS: Record<string, string> = {
  zendesk: '🎫',
  typeform: '📋',
  intercom: '💬',
  g2: '⭐',
  capterra: '🔖',
  news: '📰',
  linkedin: '💼',
  mixpanel: '📊',
  segment: '🔀',
  shopify: '🛒',
};

export const SOURCE_DESCRIPTIONS: Record<string, string> = {
  zendesk: 'Support tickets and customer conversations',
  typeform: 'Survey responses and form submissions',
  intercom: 'Live chat and in-app messaging',
  g2: 'Public G2 review scraping',
  capterra: 'Public Capterra review scraping',
  news: 'News and web signals via SerpAPI',
  linkedin: 'LinkedIn job postings for competitor intel',
  mixpanel: 'Product analytics events',
  segment: 'Customer data platform events',
  shopify: 'E-commerce order and session events',
};

export const SOURCE_DATA_COLLECTED: Record<string, string> = {
  zendesk: 'Tickets, tags, satisfaction scores',
  typeform: 'Responses, scores, completion rates',
  intercom: 'Conversations, segments, tags',
  g2: 'Reviews, ratings, competitor comparisons',
  capterra: 'Reviews, ratings, pros/cons',
  news: 'Headlines, sources, publication dates',
  linkedin: 'Job titles, locations, postings',
  mixpanel: 'Events, funnels, cohorts',
  segment: 'Tracks, identifies, pages',
  shopify: 'Orders, sessions, products',
};

export const SOURCE_SYNC_FREQ: Record<string, string> = {
  zendesk: 'Every 6h',
  typeform: 'Every 6h',
  intercom: 'Every 6h',
  g2: 'Every 24h',
  capterra: 'Every 24h',
  news: 'Every 2h',
  linkedin: 'Every 12h',
  mixpanel: 'Real-time',
  segment: 'Real-time',
  shopify: 'Every 6h',
};

export const BETA_TYPES = new Set(['capterra', 'linkedin', 'news']);

export const SOURCE_CATEGORIES: Record<string, string[]> = {
  'Voice of Customer': ['zendesk', 'typeform', 'intercom'],
  'Competitive Intelligence': ['g2', 'capterra', 'news', 'linkedin'],
  'Behavioral Analytics': ['mixpanel', 'segment', 'shopify'],
};
