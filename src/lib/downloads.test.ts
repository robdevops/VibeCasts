import type { Episode } from '@/api/types';

import { downloadAllowed, planAutoDownloads, shouldAutoArchive, shouldAutoDelete } from './downloads';
import { emptyEpisodeState, episodeKey, type EpisodeState } from './episode-state';

const HOUR = 3_600_000;
const played = (over: Partial<EpisodeState> = {}): EpisodeState => ({ ...emptyEpisodeState, played: true, playedAt: 0, ...over });

describe('shouldAutoArchive', () => {
  it('never archives when off, or what is unplayed or already archived', () => {
    expect(shouldAutoArchive(played(), 99 * HOUR, 'never', true)).toBe(false);
    expect(shouldAutoArchive(emptyEpisodeState, 99 * HOUR, 'played', true)).toBe(false);
    expect(shouldAutoArchive(played({ archived: true }), 99 * HOUR, 'played', true)).toBe(false);
    expect(shouldAutoArchive(undefined, 0, 'played', true)).toBe(false);
  });

  it('"after playing" archives straight away', () => {
    expect(shouldAutoArchive(played(), 0, 'played', true)).toBe(true);
  });

  it('waits the chosen time after the episode was played', () => {
    expect(shouldAutoArchive(played(), 23 * HOUR, '24h', true)).toBe(false);
    expect(shouldAutoArchive(played(), 24 * HOUR, '24h', true)).toBe(true);
    expect(shouldAutoArchive(played(), 47 * HOUR, '2d', true)).toBe(false);
    expect(shouldAutoArchive(played(), 48 * HOUR, '2d', true)).toBe(true);
    expect(shouldAutoArchive(played(), 167 * HOUR, '1w', true)).toBe(false);
    expect(shouldAutoArchive(played(), 168 * HOUR, '1w', true)).toBe(true);
  });

  it('falls back to the last listened time, and waits if there is no time at all', () => {
    expect(shouldAutoArchive(played({ playedAt: undefined, lastPlayed: 0 }), 25 * HOUR, '24h', true)).toBe(true);
    expect(shouldAutoArchive(played({ playedAt: undefined }), 99 * HOUR, '24h', true)).toBe(false);
  });

  it('keeps starred episodes unless asked to include them', () => {
    expect(shouldAutoArchive(played({ starred: true }), 0, 'played', false)).toBe(false);
    expect(shouldAutoArchive(played({ starred: true }), 0, 'played', true)).toBe(true);
  });
});

describe('downloadAllowed', () => {
  const wifi = { charging: false, connection: 'wifi', metered: false } as const;
  const cell = { charging: true, connection: 'cellular', metered: true } as const;

  it('needs a connection', () => {
    expect(downloadAllowed({ onlyWhenCharging: false, network: 'any' }, { ...wifi, connection: 'none' })).toBe(false);
  });
  it('only when charging', () => {
    expect(downloadAllowed({ onlyWhenCharging: true, network: 'any' }, wifi)).toBe(false);
    expect(downloadAllowed({ onlyWhenCharging: true, network: 'any' }, cell)).toBe(true);
  });
  it('wifi and unmetered rules', () => {
    expect(downloadAllowed({ onlyWhenCharging: false, network: 'wifi' }, cell)).toBe(false);
    expect(downloadAllowed({ onlyWhenCharging: false, network: 'wifi' }, wifi)).toBe(true);
    expect(downloadAllowed({ onlyWhenCharging: false, network: 'unmetered' }, cell)).toBe(false);
    expect(downloadAllowed({ onlyWhenCharging: false, network: 'unmetered' }, { ...cell, metered: false })).toBe(true);
    expect(downloadAllowed({ onlyWhenCharging: false, network: 'unmetered' }, { ...wifi, metered: true })).toBe(false);
  });
});

describe('planAutoDownloads', () => {
  const ep = (id: string): Episode => ({ id, podcastId: 'p', title: id, description: '', audioUrl: `https://a/${id}.mp3`, published: 0, durationSec: 100 });
  const eps = ['e5', 'e4', 'e3', 'e2', 'e1'].map(ep); // newest first
  const st = (id: string, s: Partial<EpisodeState>): [string, EpisodeState] => [episodeKey('p', id), { ...emptyEpisodeState, ...s }];

  it('downloads the newest unplayed episodes up to the limit', () => {
    const plan = planAutoDownloads({ podcastId: 'p', episodes: eps, states: {}, limit: 3 });
    expect(plan.download.map((e) => e.id)).toEqual(['e5', 'e4', 'e3']);
    expect(plan.remove).toEqual([]);
  });

  it('skips played and archived episodes and fills from older ones', () => {
    const states = Object.fromEntries([st('e5', { played: true }), st('e4', { archived: true })]);
    expect(planAutoDownloads({ podcastId: 'p', episodes: eps, states, limit: 2 }).download.map((e) => e.id)).toEqual(['e3', 'e2']);
  });

  it('does not download again what is already there, and rotates the oldest auto download off', () => {
    const states = Object.fromEntries([
      st('e4', { downloadedUri: 'f4', autoDownloaded: true }),
      st('e3', { downloadedUri: 'f3', autoDownloaded: true }),
      st('e2', { downloadedUri: 'f2', autoDownloaded: true }),
    ]);
    const plan = planAutoDownloads({ podcastId: 'p', episodes: eps, states, limit: 3 }); // e5 is new
    expect(plan.download.map((e) => e.id)).toEqual(['e5']);
    expect(plan.remove.map((e) => e.id)).toEqual(['e2']);
  });

  it('never removes downloads the user chose or starred ones', () => {
    const states = Object.fromEntries([
      st('e1', { downloadedUri: 'f1' }),
      st('e2', { downloadedUri: 'f2', autoDownloaded: true, starred: true }),
    ]);
    expect(planAutoDownloads({ podcastId: 'p', episodes: eps, states, limit: 1 }).remove).toEqual([]);
  });

  it('removes auto downloads once played', () => {
    const states = Object.fromEntries([st('e5', { downloadedUri: 'f5', autoDownloaded: true, played: true })]);
    expect(planAutoDownloads({ podcastId: 'p', episodes: eps, states, limit: 3 }).remove.map((e) => e.id)).toEqual(['e5']);
  });

  it('limit of zero downloads nothing', () => {
    expect(planAutoDownloads({ podcastId: 'p', episodes: eps, states: {}, limit: 0 }).download).toEqual([]);
  });
});

describe('shouldAutoDelete', () => {
  const withFile = (over: Partial<EpisodeState> = {}): EpisodeState => played({ downloadedUri: 'file:///x', ...over });

  it('needs a downloaded, played episode', () => {
    expect(shouldAutoDelete(played(), 99 * HOUR, 'played', true)).toBe(false); // nothing downloaded
    expect(shouldAutoDelete({ ...emptyEpisodeState, downloadedUri: 'f' }, 99 * HOUR, 'played', true)).toBe(false); // unplayed
    expect(shouldAutoDelete(withFile(), 0, 'never', true)).toBe(false);
  });

  it('uses the same periods as archive, even when the episode is already archived', () => {
    expect(shouldAutoDelete(withFile(), 0, 'played', true)).toBe(true);
    expect(shouldAutoDelete(withFile({ archived: true }), 24 * HOUR, '24h', true)).toBe(true);
    expect(shouldAutoDelete(withFile(), 47 * HOUR, '2d', true)).toBe(false);
    expect(shouldAutoDelete(withFile(), 168 * HOUR, '1w', true)).toBe(true);
  });

  it('keeps starred downloads unless asked', () => {
    expect(shouldAutoDelete(withFile({ starred: true }), 0, 'played', false)).toBe(false);
    expect(shouldAutoDelete(withFile({ starred: true }), 0, 'played', true)).toBe(true);
  });
});
