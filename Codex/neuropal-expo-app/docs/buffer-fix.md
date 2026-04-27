# `react-native-svg` Buffer import fix

## The failure

```
The package at "node_modules/react-native-svg/src/utils/fetchData.ts"
attempted to import the Node standard library module "buffer".
It failed because the native React runtime does not include the Node standard library.
```

## Why it happens

`react-native-svg@^15.10` ships with `src/utils/fetchData.ts`, which does:

```ts
import { Buffer } from 'buffer';
```

The `buffer` symbol there is the Node standard-library module — not an npm
package. React Native's runtime doesn't include the Node stdlib, so Metro
refuses to resolve it. The file is imported transitively from the library's
entry point, so the failure happens even if your code never uses `SvgUri`
or anything that needs `fetchData`.

Starting with Expo SDK 55, Metro's resolver tightened its handling of
"unknown" stdlib module names, which is why the same source that compiled
on SDK 52 explodes here.

## The fix

Two coordinated pieces:

1. **Install the `buffer` polyfill** — a pure-JS shim published to npm that
   reimplements the Node `Buffer` API.

   ```bash
   npm install buffer
   ```

2. **Alias `buffer` in Metro's resolver** (`metro.config.js`):

   ```js
   config.resolver.extraNodeModules = {
     ...(config.resolver.extraNodeModules ?? {}),
     buffer: require.resolve("buffer"),
   };
   ```

3. **Install the global `Buffer` at entry** (`App.js`):

   ```js
   import { Buffer } from "buffer";
   if (typeof global.Buffer === "undefined") {
     global.Buffer = Buffer;
   }
   ```

   The resolver alias is enough for the bundler to link the module, but
   a few SVG helpers touch `global.Buffer` at runtime. Seeding it here
   keeps their fast-paths happy.

## Why not just downgrade?

`react-native-svg@15.8.0` and earlier don't have `fetchData.ts`, so a pin
avoids the problem — but it also locks you out of later bug-fixes and
the newArchEnabled-compatible touchables in 15.10+. The polyfill is
~5 KB gzipped and costs nothing at runtime; it's the cleaner lever.

## Why not strip `fetchData.ts` with `resolver.blockList`?

Tempting, but `ReactNativeSVG.ts` imports from it unconditionally. Block
the file and `SvgUri` crashes with a runtime `undefined is not a function`
instead of a build-time error — a worse failure mode.
