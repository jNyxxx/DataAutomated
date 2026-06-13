export type ConnectionStatus =
  | 'pending_configuration'
  | 'testing'
  | 'active'
  | 'failed'
  | 'disconnected';

export interface DataSource {
  id: string;
  source_type: string;
  is_active: boolean;
  last_synced_at: string | null;
  created_at: string;
  connection_status: ConnectionStatus;
  connection_error: string | null;
}

export const SOURCE_LABELS: Record<string, string> = {
  zendesk:            'Zendesk',
  typeform:           'Typeform',
  intercom:           'Intercom',
  mixpanel:           'Mixpanel',
  segment:            'Segment',
  shopify:            'Shopify',
  g2:                 'G2 Reviews',
  capterra:           'Capterra Reviews',
  news:               'News / Web',
  linkedin_jobs:      'LinkedIn Jobs',
  competitor_monitor: 'Competitor Monitor',
};

export const SOURCE_ICONS: Record<string, string> = {
  zendesk:            '🎫',
  typeform:           '📋',
  intercom:           '💬',
  mixpanel:           '📊',
  segment:            '🔗',
  shopify:            '🛒',
  g2:                 '⭐',
  capterra:           '📝',
  news:               '📰',
  linkedin_jobs:      '💼',
  competitor_monitor: '🔍',
};

export const SOURCE_DESCRIPTIONS: Record<string, string> = {
  zendesk:            'Customer support tickets, CSAT scores, and agent conversations',
  typeform:           'Survey responses, NPS scores, and feedback form submissions',
  intercom:           'In-app conversations, support chats, and customer messages',
  mixpanel:           'User event streams, funnels, and product analytics',
  segment:            'Unified customer event data and identity resolution',
  shopify:            'Order events, abandoned carts, and shopper behavior',
  g2:                 'Public reviews, ratings, and competitive comparisons on G2',
  capterra:           'Software reviews and buyer intent signals from Capterra',
  news:               'News articles, press coverage, and web mentions',
  linkedin_jobs:      'Competitor hiring activity and role trends',
  competitor_monitor: 'Cross-channel competitor tracking — pricing, launches, signals',
};

export const SOURCE_DATA_COLLECTED: Record<string, string> = {
  zendesk:            'Tickets · CSAT · Agent notes',
  typeform:           'Survey responses · NPS',
  intercom:           'Conversations · Tags',
  mixpanel:           'Events · Funnels · Retention',
  segment:            'Events · Profiles · Traits',
  shopify:            'Orders · Abandoned carts · Sessions',
  g2:                 'Reviews · Ratings · Comparisons',
  capterra:           'Reviews · Ratings',
  news:               'Articles · Mentions · Sentiment',
  linkedin_jobs:      'Job postings · Role growth',
  competitor_monitor: 'Pricing · Launches · Signals',
};

export const SOURCE_SYNC_FREQ: Record<string, string> = {
  zendesk:            'Every 6 hours',
  typeform:           'Every 6 hours',
  intercom:           'Every 6 hours',
  mixpanel:           'Daily',
  segment:            'Every 6 hours',
  shopify:            'Every 6 hours',
  g2:                 'Every 2 hours',
  capterra:           'Every 2 hours',
  news:               'Every 2 hours',
  linkedin_jobs:      'Daily',
  competitor_monitor: 'Every 2 hours',
};

export const SOURCE_CATEGORIES: Record<string, string[]> = {
  'VoC (Customer Feedback)':  ['zendesk', 'typeform', 'intercom'],
  'Competitive Intelligence': ['g2', 'capterra', 'news', 'linkedin_jobs', 'competitor_monitor'],
  'Behavioral Journey':       ['mixpanel', 'segment', 'shopify'],
};

export const BETA_TYPES = new Set(['g2', 'capterra', 'news', 'mixpanel', 'segment', 'shopify', 'linkedin_jobs']);
