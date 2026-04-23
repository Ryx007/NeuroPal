# NeuroPal Expo 55 App

NeuroPal rebuilt as a functional Expo 55 mobile app that mirrors the supplied handoff wireframes and HTML design references, while following these requested constraints:

- no Next.js
- JavaScript and JSX only
- Tailwind via NativeWind
- MUI included for web-only surfaces
- Redux Toolkit with `useSelector` and `useDispatch`
- React Navigation instead of Expo Router
- axios-based network calls through a dedicated network module

## Design sources used

- [NeuroPal-handoff-updated.zip](../NeuroPal-handoff-updated.zip)
- [NeuroPal-updated.zip](../NeuroPal-updated.zip)
- [project/refs/home_dashboard.png](../neuropal/project/refs/home_dashboard.png)
- [project/refs/document_library.png](../neuropal/project/refs/document_library.png)
- [project/refs/reading_mode.png](../neuropal/project/refs/reading_mode.png)
- [project/refs/daily_anchors.png](../neuropal/project/refs/daily_anchors.png)
- [project/refs/onboarding_flow.png](../neuropal/project/refs/onboarding_flow.png)
- [project/refs/emergency_protocol.png](../neuropal/project/refs/emergency_protocol.png)
- [project/neuropal-app/README.md](../neuropal/project/neuropal-app/README.md)

## Stack

- Expo SDK 55
- React Native + React Navigation
- Redux Toolkit + React Redux hooks
- NativeWind for Tailwind-style utility classes
- MUI on web-only components via platform-specific files
- axios for network access through [src/services/network.js](./src/services/network.js)

## Project structure

- [App.js](./App.js) sets up fonts, providers, and navigation
- [src/navigation/AppNavigator.jsx](./src/navigation/AppNavigator.jsx) contains the stack and bottom-tab app shell
- [src/screens](./src/screens) contains the app screens in JSX
- [src/store](./src/store) contains Redux slices, selectors, and persistence helpers
- [src/services/network.js](./src/services/network.js) is the shared axios entry point for API calls
- [src/components/TweaksSheet.web.jsx](./src/components/TweaksSheet.web.jsx) provides the MUI implementation for web

## Run

```bash
cd neuropal-expo-app
npm install
npx expo start
```

Useful commands:

- `npm run ios`
- `npm run android`
- `npm run web`

## Notes

- The old Expo Router + TypeScript tree was moved into `legacy-ts-router/` so the active runtime stays JavaScript-only.
- MUI is applied on web via platform-specific components. Native iOS and Android screens remain React Native components so the app still builds as a real mobile app.
- The reader AI flow uses axios through the shared network module and falls back to a local mock response if `EXPO_PUBLIC_API_BASE_URL` is not configured.
