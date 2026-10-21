/**
 * Props for vertical lists so they stretch like an elastic band when you hit the top or bottom (iOS bounce; on Android the
 * system's own overscroll: the stretch effect on Android 12+, a glow on older versions), even when the content is short.
 * Spread onto a ScrollView / FlatList / SectionList.
 */
export const ELASTIC_SCROLL = {
  overScrollMode: 'always',
  bounces: true,
  alwaysBounceVertical: true,
} as const;
