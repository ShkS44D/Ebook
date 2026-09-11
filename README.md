# iBook mobile UI

React Native / Expo prototype for iOS and Android, based on the 95 supplied screenshots in `ui/`. All content is bundled locally. Forms, selection controls and navigation are interactive previews; there are no backend, authentication, payment or messaging services.

## Run

```sh
cd mobile
npm install
npm start
```

Open with a compatible Expo Go installation, or press `i` / `a` for an installed iOS simulator / Android emulator. Native development builds can be generated with `npx expo run:ios` or `npx expo run:android` when the respective SDK is installed.

For a quick browser preview:

```sh
cd mobile
npm run web
```

Open `/gallery` to inspect the screen variants directly. On mobile: Home → profile avatar → grid menu → Screen Preview Gallery. Toggle appearance in Settings or the gallery. Reader appearance is independent: open a book → Start Reading → aA.

## Included

- Splash, three onboarding pages, sign in/up, password reset and verification.
- Home, Library, Store and Search tabs with floating glass navigation.
- Book details, reviews, reader, reader controls, collection/save/share previews.
- Collections, editing and selection, add-book and illustrated empty/deletion states.
- Friend feed, invitation, discovery, profiles and local chat previews.
- Profiles, author detail, membership, settings, reading goals and notifications.
- Purchase, payment methods, success/failure, App Store and download previews.
- Light/dark themes, safe-area handling, scrollable short-screen layouts, adaptive tablet grids, spring press feedback and floating artwork.

## Project structure

- `mobile/App.tsx`: navigation, themes and screen gallery.
- `mobile/src/*-screens.tsx`: screens grouped by flow.
- `mobile/src/ui.tsx`: shared visual components and glass capability fallback.
- `mobile/src/data.ts`: dummy content.
- `mobile/assets/reference/`: artwork extracted from the supplied screenshots.
- `mobile/scripts/extract-assets.py`: reproducible asset extraction (requires Pillow).
- `mobile/src/reference-manifest.json`: all 95 source screenshots.

The implementation recreates the supplied layouts with native components. Source artwork is screenshot resolution, so some images remain soft when enlarged. System keyboards are supplied by the device; purchase and share panels are visual previews. Glass is native on supported iOS builds through `expo-glass-effect`, with a translucent blur fallback on other platforms. No particular iOS 27 SDK behavior is assumed beyond runtime capability checks.

## Checks

```sh
cd mobile
npm run typecheck
npx expo export --platform all
```
