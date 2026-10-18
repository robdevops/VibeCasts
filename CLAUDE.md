# mobiletest

Expo (SDK 57, to match the store build of Expo Go) + React Native + TypeScript + Expo Router app for experimenting with small app clones. Read `AGENTS.md` first: Expo APIs change every SDK, so check the versioned docs before touching them.

## Commands
- `npm run web`: dev server for the web target on :8081 (`expo start --web`)
- `npm run check`: typecheck + lint + Jest (run before saying a change is done)
- `npm test`: Jest (`jest-expo`, `@testing-library/react-native`; `render`/`fireEvent` are async, so `await` them)
- `npm run shot -- /route out.png`: Playwright screenshot of a route at 390x844 (needs the dev server running; uses `/opt/pw-browsers/chromium`). `SEED=1` preloads a fake library from `tools/seed-data.mjs` (no network needed), `DARK=1` uses dark mode.

## Testing in the cloud container
No Android emulator (no KVM). Verify UI via the web target + screenshots, and logic via Jest. Web is a proxy for layout and logic only; gestures, haptics, safe areas and keyboards need a real device/emulator.
Don't run the dev server with `CI=1` (it disables reloads, so new routes aren't picked up).
`expo lint` can't auto-configure here (proxy), so ESLint is configured manually in `eslint.config.js`.

## Adding a screen
Create `src/app/<name>.tsx` and add a trigger in both `src/components/app-tabs.tsx` (native) and `app-tabs.web.tsx` (web).

## Local (macOS) emulator
Node 24 (`.nvmrc`), Xcode (iOS Simulator), Android Studio (AVD). `npx expo start`, then `i` / `a`. Claude Code run locally can screenshot with `xcrun simctl io booted screenshot x.png` or `adb exec-out screencap -p > x.png`.

## Gotchas
- Gesture objects in `TileGrid` cells are memoised on purpose: recreating a `Gesture` on re-render cancels an in-progress drag. Keep handlers stable (see the `latest` ref there).
- Use `sharedValue.set()`/`.get()` for writes (the React Compiler lint rule rejects `.value =`).
- Artwork is wrapped in `pointerEvents="none"`: on web an `<img>` starts a native drag and cancels gestures.
- In SDK 57 native tabs are imported from `expo-router/unstable-native-tabs`.
