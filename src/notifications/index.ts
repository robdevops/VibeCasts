import { useFeeds } from '@/store/feeds';

import { createNotifier } from './notifier';
import { createDeviceNotifications } from './platform';

export const notifier = createNotifier({ platform: createDeviceNotifications() });

/** Check for new episodes whenever feeds refresh (debounced), and once at startup. */
export function startNewEpisodeNotifications(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const soon = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void notifier.check().catch(() => {}), 3000);
  };
  const off = useFeeds.subscribe((s, p) => s.feeds !== p.feeds && soon());
  soon();
  return () => {
    clearTimeout(timer);
    off();
  };
}
