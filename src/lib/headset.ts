/**
 * What the headset / Bluetooth transport buttons do. "Skip" is the next / previous track button;
 * "seek" is the fast-forward / rewind gesture (a press and hold on some headsets).
 */
export type HeadsetButton = 'skipForward' | 'skipBack' | 'seekForward' | 'seekBack' | 'playPause';
export type HeadsetAction = 'none' | 'seek' | 'episode' | 'toggle';

export const HEADSET_BUTTONS: HeadsetButton[] = ['skipForward', 'skipBack', 'seekForward', 'seekBack', 'playPause'];

export const HEADSET_BUTTON_LABELS: Record<HeadsetButton, string> = {
  skipForward: 'Skip forward action',
  skipBack: 'Skip back action',
  seekForward: 'Seek forward action',
  seekBack: 'Seek back action',
  playPause: 'Pause / play action',
};

export const HEADSET_BUTTON_HINTS: Record<HeadsetButton, string> = {
  skipForward: 'The headset next track button.',
  skipBack: 'The headset previous track button.',
  seekForward: 'The headset fast-forward gesture.',
  seekBack: 'The headset rewind gesture.',
  playPause: 'The headset play / pause button.',
};

export const HEADSET_DEFAULTS: Record<HeadsetButton, HeadsetAction> = {
  skipForward: 'seek',
  skipBack: 'seek',
  seekForward: 'seek',
  seekBack: 'seek',
  playPause: 'toggle',
};

export const isForwardButton = (b: HeadsetButton) => b === 'skipForward' || b === 'seekForward';

/** The actions a button can be set to, in the order the picker shows them. */
export function headsetOptions(button: HeadsetButton): HeadsetAction[] {
  return button === 'playPause' ? ['none', 'toggle'] : ['none', 'seek', 'episode'];
}

/** A saved value that is no longer valid for the button falls back to its default. */
export function sanitizeHeadsetAction(button: HeadsetButton, value: unknown): HeadsetAction {
  return headsetOptions(button).includes(value as HeadsetAction) ? (value as HeadsetAction) : HEADSET_DEFAULTS[button];
}

/** The picker / summary text for an action, with the app's skip length for seeks. */
export function headsetActionLabel(button: HeadsetButton, action: HeadsetAction, backSec: number, forwardSec: number): string {
  const forward = isForwardButton(button);
  switch (action) {
    case 'none':
      return 'Do nothing';
    case 'seek':
      return forward ? `Seek forward ${forwardSec}s` : `Seek back ${backSec}s`;
    case 'episode':
      return forward ? 'Next episode' : 'Previous episode';
    default:
      return 'Toggle playback';
  }
}

/** Restart the current episode instead of going back when it has played at least this long. */
export const PREVIOUS_RESTART_SEC = 5;
