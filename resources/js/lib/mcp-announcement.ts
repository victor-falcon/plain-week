import { createOnceCardStore } from '@/lib/once-card';

/**
 * Whether the one-time "New: connect an AI agent" card is open, opened by the
 * planner page; any close sets `plain-week.mcp-announcement-seen`.
 */
export const mcpAnnouncementStore = createOnceCardStore(
    'plain-week.mcp-announcement-seen',
);
