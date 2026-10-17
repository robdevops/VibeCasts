# mobiletest

Expo (SDK 58) + React Native + TypeScript + Expo Router app for experimenting with small app clones. Read `AGENTS.md` first: Expo APIs change every SDK, so check the versioned docs before touching them.

## Commands
- `npm run web`: dev server for the web target on :8081 (`expo start --web`)
- `npm run check`: typecheck + lint + Jest (run before saying a change is done)
- `npm test`: Jest (`jest-expo`, `@testing-library/react-native`; `render`/`fireEvent` are async, so `await` them)
- `npm run shot -- /route out.png`: Playwright screenshot of a route at 390x844 (needs the dev server running; uses `/opt/pw-browsers/chromium`)

## Testing in the cloud container
No Android emulator (no KVM). Verify UI via the web target + screenshots, and logic via Jest. Web is a proxy for layout and logic only; gestures, haptics, safe areas and keyboards need a real device/emulator.
Don't run the dev server with `CI=1` (it disables reloads, so new routes aren't picked up).
`expo lint` can't auto-configure here (proxy), so ESLint is configured manually in `eslint.config.js`.

## Adding a screen
Create `src/app/<name>.tsx` and add a trigger in both `src/components/app-tabs.tsx` (native) and `app-tabs.web.tsx` (web).

## Local (macOS) emulator
Node 24 (`.nvmrc`), Xcode (iOS Simulator), Android Studio (AVD). `npx expo start`, then `i` / `a`. Claude Code run locally can screenshot with `xcrun simctl io booted screenshot x.png` or `adb exec-out screencap -p > x.png`.
