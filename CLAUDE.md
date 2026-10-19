# mobiletest

Expo (SDK 57, to match the store build of Expo Go) + React Native + TypeScript + Expo Router app for experimenting with small app clones. Read `AGENTS.md` first: Expo APIs change every SDK, so check the versioned docs before touching them.

## Commands
- `npm run web`: dev server for the web target on :8081 (`expo start --web`)
- `npm run check`: typecheck + lint + Jest (run before saying a change is done)
- `npm test`: Jest (`jest-expo`, `@testing-library/react-native`; `render`/`fireEvent` are async, so `await` them)
- `npm run shot -- /route out.png`: Playwright screenshot of a route at 390x844 (needs the dev server running; uses `/opt/pw-browsers/chromium`). `SEED=1` preloads a fake library from `tools/seed-data.mjs` (no network needed), `MOCK=1` fakes the iTunes endpoints (`MOCK=feeds` also answers `/api/feed`), `DARK=1` uses dark mode.

## Testing in the cloud container
No Android emulator (no KVM). Verify UI via the web target + screenshots, and logic via Jest. Web is a proxy for layout and logic only; gestures, haptics, safe areas and keyboards need a real device/emulator.
Don't run the dev server with `CI=1` (it disables reloads, so new routes aren't picked up).
`expo lint` can't auto-configure here (proxy), so ESLint is configured manually in `eslint.config.js`.

## Adding a screen
Each tab is a route group with its own stack (`src/app/(tabs)/(podcasts)`, `(discovery)`, `(playlists)`) so detail pages keep the tab bar. A new tab needs a group folder with `_layout.tsx` (a `Stack`) plus a `TabTrigger` in `src/components/app-tabs.tsx`. That one custom tab bar serves every platform (instead of native tabs) so the persistent mini player can sit exactly above it. Tab roots other than Podcasts need a real segment (`playlists.tsx`, `discovery.tsx`) so URLs don't collide. Link to detail pages with the full group path, e.g. `/(tabs)/(podcasts)/podcast/[id]`.

## Local (macOS) emulator
Node 24 (`.nvmrc`), Xcode (iOS Simulator), Android Studio (AVD). `npx expo start`, then `i` / `a`. Claude Code run locally can screenshot with `xcrun simctl io booted screenshot x.png` or `adb exec-out screencap -p > x.png`.

## Gotchas
- Gesture objects in `TileGrid` cells are memoised on purpose: recreating a `Gesture` on re-render cancels an in-progress drag. Keep handlers stable (see the `latest` ref there).
- Use `sharedValue.set()`/`.get()` for writes (the React Compiler lint rule rejects `.value =`).
- Artwork is wrapped in `pointerEvents="none"`: on web an `<img>` starts a native drag and cancels gestures.
- In SDK 57 native tabs are imported from `expo-router/unstable-native-tabs`.

## Audio, lock screen and background playback
- `src/store/player.ts` is the single player (current episode, position, rate, sleep timer; saves progress to the library and restores the last episode after a restart). It talks to audio only through the `PlayerEngine` interface in `src/player/engine.ts` (`expo-audio`); tests use `src/player/fake-engine.ts`.
- Background audio and lock-screen/notification/Bluetooth controls come from `expo-audio`: `setAudioModeAsync({ shouldPlayInBackground: true, interruptionMode: 'doNotMix' })` plus `setActiveForLockScreen(...)`, and the `expo-audio` config plugin in `app.json` (iOS `UIBackgroundModes: audio`; Android media foreground service). The lock-screen skip buttons are a fixed 10 s set by the OS.
- Android in **Expo Go** can't show lock-screen controls (its manifest has no media service), so `engine.ts` skips them there. Use a development build for the real thing: `npx eas-cli@latest build --profile development --platform android` (or `ios`), install it, then `npm run dev-client`.
- `ios.bundleIdentifier` / `android.package` are `org.robstevens.mobiletest`: change them before the first store release.
