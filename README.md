# VibeCasts

A Pocket Casts-style podcast app for Android (and web, for layout checks), with a light purple look in light and dark. Built with Expo as a playground for small app clones.

## Features

- **Library grid**: square art tiles with unplayed badges, folders, drag to reorder or drop into a folder, word-start search, OPML import and export.
- **Discovery**: search iTunes, browse charts and categories, or add any feed URL directly.
- **Player**: persistent mini player that drags up into a full player sheet (Playing / Details / Bookmarks), plus a slide-up episode lobby for any episode.
- **Reliable playback**: background and lock-screen controls, Bluetooth headset button mapping, sleep timer, skip-first/last, and guards that keep your place.
- **Downloads and notifications**: manual and automatic downloads with archive/delete rules, and local new-episode alerts.
- **Playlists**: Up Next queue and named playlists with drag-to-reorder, bookmarks and starred episodes.
- **Smooth transitions**: folder and show zoom, artwork flight back to the tile, elastic scrolling.

## Tech specs

- Expo SDK 57, React Native 0.86, React 19.2 (React Compiler), TypeScript
- Expo Router (a route group per tab, custom tab bar), zustand stores
- Reanimated 4 and react-native-gesture-handler
- `expo-audio` behind a `PlayerEngine` interface, with a patch-package patch for an Android wake lock and headset buttons
- Data from the iTunes API and RSS (`fast-xml-parser`), with a conditional-GET feed cache
- Storage: SQLite on native, localStorage on web, through a coalescing writer
- Jest (`jest-expo`, Testing Library) and Playwright screenshots

## Commands

```bash
npm ci
npm run web
npm run dev-client
npm run check
npx eas-cli@latest build --profile development --platform android
```

`npm run check` runs the typecheck, lint and tests. The EAS build is only needed when native code or `app.json` changes; JavaScript changes reload on their own.

See `CLAUDE.md` for architecture notes.
