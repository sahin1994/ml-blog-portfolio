import readingTime from 'reading-time';

export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function shortDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function readMinutes(body: string | undefined): number {
  if (!body) return 1;
  return Math.max(1, Math.round(readingTime(body).minutes));
}

export function sortByDate<T extends { data: { pubDate: Date } }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf(),
  );
}

// Drafts are visible in `astro dev` (so the studio preview can render them) and
// hidden in production builds.
export const showDrafts = import.meta.env.DEV;

export function published<T extends { data: { draft?: boolean } }>(items: T[]): T[] {
  return showDrafts ? items : items.filter((i) => !i.data.draft);
}
