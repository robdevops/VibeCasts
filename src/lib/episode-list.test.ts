import type { Episode } from '@/api/types';

import { durationLabel, episodeCounts, episodeDateLabel, visibleEpisodes } from './episode-list';

const ep = (id: string, title: string, published: number, description = ''): Episode => ({
  id, podcastId: 'p', title, description, audioUrl: 'x', published, durationSec: 60,
});
const eps = [ep('a', 'Alpha AI', 3), ep('b', 'Beta', 1, 'about robots'), ep('c', 'Gamma', 2)];
const base = { progressMs: 0, played: false, starred: false };
const states = { 'p|c': { ...base, archived: true } };
const f = { query: '', showArchived: false, sort: 'newest' as const };

it('hides archived by default and sorts newest first', () => {
  expect(visibleEpisodes('p', eps, states, f).map((e) => e.id)).toEqual(['a', 'b']);
});
it('shows archived on request and sorts oldest first', () => {
  expect(visibleEpisodes('p', eps, states, { ...f, showArchived: true, sort: 'oldest' }).map((e) => e.id)).toEqual(['b', 'c', 'a']);
});
it('filters by title or description, case-insensitively', () => {
  expect(visibleEpisodes('p', eps, states, { ...f, query: ' ai' }).map((e) => e.id)).toEqual(['a']);
  expect(visibleEpisodes('p', eps, states, { ...f, query: 'ROBOTS' }).map((e) => e.id)).toEqual(['b']);
});
it('counts archived', () => {
  expect(episodeCounts('p', eps, states)).toEqual({ total: 3, archived: 1 });
});
it('formats labels', () => {
  const now = Date.parse('2026-10-19T00:00:00Z');
  expect(episodeDateLabel(Date.parse('2026-10-16T12:00:00Z'), now)).toBe('16 OCTOBER');
  expect(episodeDateLabel(Date.parse('2025-03-02T12:00:00Z'), now)).toBe('2 MARCH 2025');
  expect(durationLabel(1620)).toBe('27m');
  expect(durationLabel(3723)).toBe('1h 2m');
  expect(durationLabel(0)).toBe('');
});
