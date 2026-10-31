#!/bin/bash
# Regenerates the reader word fixture from the web reader and the Expo app:
#   neuropal-ios/scripts/make-reader-words.sh
# Needs Node 22+ (type stripping). The iOS word stream (NPCore ReaderWords)
# must produce exactly these words — Tests/NPCoreTests/ReaderWordsTests.swift.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/src"
cp "$repo/neuropal-platform/src/lib/neuropal/reader/math.ts" "$work/src/math.ts"
sed 's#from "./math";#from "./math.ts";#; s#^import type .*##' \
  "$repo/neuropal-platform/src/lib/neuropal/reader/sections.ts" > "$work/src/sections.ts"
cp "$repo/neuropal-expo-app/src/utils/math.js" "$work/src/expo-math.mjs"
cp "$here/reader-words.mts" "$work/gen.mts"
node --experimental-strip-types --no-warnings "$work/gen.mts" \
  > "$repo/neuropal-ios/Packages/NeuroPalCore/Tests/NPCoreTests/Fixtures/reader-words.json"
echo "wrote Tests/NPCoreTests/Fixtures/reader-words.json"
