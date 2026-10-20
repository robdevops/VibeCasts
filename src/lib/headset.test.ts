import { HEADSET_DEFAULTS, headsetActionLabel, headsetOptions, sanitizeHeadsetAction } from './headset';

describe('headset actions', () => {
  it('offers do nothing / seek / episode on the skip and seek buttons, and do nothing / toggle on play-pause', () => {
    expect(headsetOptions('skipForward')).toEqual(['none', 'seek', 'episode']);
    expect(headsetOptions('seekBack')).toEqual(['none', 'seek', 'episode']);
    expect(headsetOptions('playPause')).toEqual(['none', 'toggle']);
  });

  it('labels seeks with the app skip lengths and episodes by direction', () => {
    expect(headsetActionLabel('seekForward', 'seek', 15, 30)).toBe('Seek forward 30s');
    expect(headsetActionLabel('skipBack', 'seek', 15, 30)).toBe('Seek back 15s');
    expect(headsetActionLabel('skipForward', 'episode', 15, 30)).toBe('Next episode');
    expect(headsetActionLabel('seekBack', 'episode', 15, 30)).toBe('Previous episode');
    expect(headsetActionLabel('playPause', 'toggle', 15, 30)).toBe('Toggle playback');
    expect(headsetActionLabel('playPause', 'none', 15, 30)).toBe('Do nothing');
  });

  it('falls back to the default for a value that is not allowed on that button', () => {
    expect(sanitizeHeadsetAction('playPause', 'seek')).toBe(HEADSET_DEFAULTS.playPause);
    expect(sanitizeHeadsetAction('skipBack', 'toggle')).toBe(HEADSET_DEFAULTS.skipBack);
    expect(sanitizeHeadsetAction('skipBack', 'episode')).toBe('episode');
    expect(sanitizeHeadsetAction('seekForward', undefined)).toBe(HEADSET_DEFAULTS.seekForward);
  });
});
