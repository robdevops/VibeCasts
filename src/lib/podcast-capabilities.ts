/**
 * What the podcast page lets you do. Previewing an unsubscribed show is allowed (episodes can be
 * played, starred, archived...), but anything that belongs to a subscription stays disabled until
 * the user subscribes.
 */
export type Capabilities = {
  subscribe: boolean;
  unsubscribe: boolean;
  notifications: boolean;
  autoDownload: boolean;
  skipSettings: boolean;
  folder: boolean;
  // Always available:
  search: boolean;
  sort: boolean;
  star: boolean;
  archive: boolean;
  markPlayed: boolean;
  share: boolean;
};

export function capabilitiesFor(isSubscribed: boolean): Capabilities {
  return {
    subscribe: !isSubscribed,
    unsubscribe: isSubscribed,
    notifications: isSubscribed,
    autoDownload: isSubscribed,
    skipSettings: isSubscribed,
    folder: isSubscribed,
    search: true,
    sort: true,
    star: true,
    archive: true,
    markPlayed: true,
    share: true,
  };
}
