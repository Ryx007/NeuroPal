#!/bin/zsh
# Build, test and screenshot the native iOS app on a Mac (Xcode + XcodeGen).
#
#   scripts/mac-build.sh build [iphone|ipad]       generate the project + build for the simulator
#   scripts/mac-build.sh test                      swift test on NeuroPalCore (macOS, no simulator)
#   scripts/mac-build.sh shot <name> [iphone|ipad] [launch args…]
#                                                  install the last build, launch it, screenshot
#   scripts/mac-build.sh ui-test [iphone|ipad]     run the UI tests (accessibility audits)
#   scripts/mac-build.sh build-tests [iphone|ipad] compile the app and the UI tests without running them
#   scripts/mac-build.sh reboot-sim [iphone|ipad]  restart a simulator (clears a stuck system alert)
#
# Every Xcode/simulator step takes one machine-wide lock, so several
# checkouts can share one Mac without builds fighting over memory or the
# simulators. Env: NP_DERIVED (DerivedData dir; default ../.dd-<checkout>),
# NP_SHOTS (screenshot dir; default ~/Developer/neuropal-agents/shots/<checkout>),
# NP_APPEARANCE (light|dark simulator appearance, default dark),
# NP_TEXT_SIZE (simulator Dynamic Type, default large; e.g. accessibility-extra-large),
# NP_ONLY_TESTING (ui-test: e.g. NeuroPalUITests/SignInFlowTests),
# NP_UITEST_TIMEOUT (ui-test: seconds before a stuck run is stopped, default 1500).
set -euo pipefail

HERE="${0:A:h}"
IOS="${HERE:h}"
CHECKOUT="${IOS:h}"
NAME="${CHECKOUT:t}"
LOCK=/tmp/neuropal-xcode.lock
DERIVED="${NP_DERIVED:-${CHECKOUT:h}/.dd-${NAME}}"
SHOTS="${NP_SHOTS:-$HOME/Developer/neuropal-agents/shots/${NAME}}"
# iOS 26.5 simulators (xcrun simctl list devices)
IPHONE_ID="${NP_IPHONE_ID:-2D328DA9-60AD-4F27-A488-A0ED4AFD21B5}"   # iPhone 17 Pro
IPAD_ID="${NP_IPAD_ID:-C028B4BB-06F8-4E8C-9996-498FC254EFE4}"       # iPad Pro 13-inch (M5)
BUNDLE=io.neuropal.ios

device() { [[ "${1:-iphone}" == ipad ]] && echo "$IPAD_ID" || echo "$IPHONE_ID"; }

locked() { /usr/bin/lockf -t 3600 "$LOCK" "$@"; }

boot() {
  local id="$1"
  xcrun simctl boot "$id" 2>/dev/null || true
  xcrun simctl bootstatus "$id" -b >/dev/null
  xcrun simctl ui "$id" appearance "${NP_APPEARANCE:-dark}" || true
  # Always set (default: large), so one shot's text size never leaks into the next.
  xcrun simctl ui "$id" content_size "${NP_TEXT_SIZE:-large}" || true
  xcrun simctl status_bar "$id" override --time 9:41 --dataNetwork wifi --wifiBars 3 \
    --batteryState charged --batteryLevel 100 >/dev/null 2>&1 || true
}

app_path() {
  echo "$DERIVED/Build/Products/Debug-iphonesimulator/NeuroPal.app"
}

do_build() {
  local id; id=$(device "${1:-iphone}")
  cd "$IOS"
  xcodegen generate --quiet
  # Ad-hoc ("-") signing embeds the entitlements, so the App Group works in
  # the simulator; no Apple team needed.
  set +e
  xcodebuild -project NeuroPal.xcodeproj -scheme NeuroPal -configuration Debug \
    -destination "platform=iOS Simulator,id=$id" -derivedDataPath "$DERIVED" \
    CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY=- DEVELOPMENT_TEAM= PROVISIONING_PROFILE_SPECIFIER= \
    build > "$DERIVED.build.log" 2>&1
  local rc=$?
  set -e
  # Errors and warnings from our own sources, then the verdict.
  grep -E "(error|warning): " "$DERIVED.build.log" | grep -v "/DerivedData/\|SourcePackages/checkouts" \
    | sed "s|$CHECKOUT/||" | sort -u | head -80 || true
  if [[ $rc -eq 0 ]]; then echo "BUILD OK ($NAME, $(app_path))"; else
    tail -25 "$DERIVED.build.log"; echo "BUILD FAILED ($NAME) — full log: $DERIVED.build.log"; fi
  return $rc
}

do_test() {
  cd "$IOS/Packages/NeuroPalCore"
  local log="$DERIVED.test.log"
  set +e
  swift test --scratch-path "$DERIVED-core" > "$log" 2>&1
  local rc=$?
  set -e
  # Compiler errors and warnings from our own sources.
  grep -E "(error|warning): " "$log" | grep -vE "/\.build/|/checkouts/|recorded an issue" \
    | sed "s|$CHECKOUT/||" | sort -u | head -60 || true
  # Every failure (Swift Testing issues, XCTest failures, crashes)…
  grep -E "recorded an issue|failed after|with [0-9]+ issues?|error: -\[|: error: .*XCT|Fatal error|signal code|exited with" "$log" \
    | sed "s|$CHECKOUT/||" | head -120 || true
  # …then every suite's verdict and every run summary (NPTokens, NPCore, NPDay
  # and any XCTest run), so no target hides behind another.
  grep -E "Suite .*(passed|failed)|Test run with|Executed [0-9]+ tests?" "$log" || true
  if [[ $rc -eq 0 ]]; then echo "TESTS OK ($NAME)"; else echo "TESTS FAILED ($NAME, exit $rc) — full log: $log"; fi
  return $rc
}

do_shot() {
  local name="$1"; shift
  local which="iphone"
  if [[ "${1:-}" == iphone || "${1:-}" == ipad ]]; then which="$1"; shift; fi
  local id; id=$(device "$which")
  mkdir -p "$SHOTS"
  boot "$id"
  xcrun simctl terminate "$id" "$BUNDLE" 2>/dev/null || true
  # A freshly booted simulator sometimes refuses the first install.
  xcrun simctl install "$id" "$(app_path)" 2>/dev/null || { sleep 5; xcrun simctl install "$id" "$(app_path)"; }
  xcrun simctl launch "$id" "$BUNDLE" "$@" >/dev/null
  sleep "${NP_SHOT_WAIT:-4}"
  local out="$SHOTS/${name}-${which}.png"
  xcrun simctl io "$id" screenshot --type=png "$out" >/dev/null 2>&1
  # A smaller copy for reading back (the full iPad shot is ~2048×2732).
  sips -Z 1400 "$out" --out "${out%.png}.small.png" >/dev/null
  echo "SHOT $out"
}

do_reboot_sim() {
  local id; id=$(device "${1:-iphone}")
  xcrun simctl shutdown "$id" 2>/dev/null || true
  boot "$id"
  echo "REBOOTED $id"
}

do_build_tests() {
  local id; id=$(device "${1:-iphone}")
  cd "$IOS"
  xcodegen generate --quiet
  set +e
  xcodebuild -project NeuroPal.xcodeproj -scheme NeuroPal -configuration Debug \
    -destination "platform=iOS Simulator,id=$id" -derivedDataPath "$DERIVED" \
    CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY=- DEVELOPMENT_TEAM= PROVISIONING_PROFILE_SPECIFIER= \
    build-for-testing > "$DERIVED.build.log" 2>&1
  local rc=$?
  set -e
  grep -E "(error|warning): " "$DERIVED.build.log" | grep -v "/DerivedData/\|SourcePackages/checkouts" \
    | sed "s|$CHECKOUT/||" | sort -u | head -80 || true
  if [[ $rc -eq 0 ]]; then echo "BUILD FOR TESTING OK ($NAME)"; else
    tail -25 "$DERIVED.build.log"; echo "BUILD FOR TESTING FAILED ($NAME) — full log: $DERIVED.build.log"; fi
  return $rc
}

do_ui_test() {
  local id; id=$(device "${1:-iphone}")
  cd "$IOS"
  xcodegen generate --quiet
  local only=()
  [[ -n "${NP_ONLY_TESTING:-}" ]] && only=(-only-testing:"$NP_ONLY_TESTING")
  set +e
  xcodebuild -project NeuroPal.xcodeproj -scheme NeuroPal -configuration Debug \
    -destination "platform=iOS Simulator,id=$id" -derivedDataPath "$DERIVED" \
    CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY=- DEVELOPMENT_TEAM= PROVISIONING_PROFILE_SPECIFIER= \
    "${only[@]}" test > "$DERIVED.uitest.log" 2>&1 &
  local xc=$!
  # A run that can't start (the test runner never connects) would hold the
  # machine-wide lock forever: stop it after NP_UITEST_TIMEOUT seconds.
  local waited=0 limit="${NP_UITEST_TIMEOUT:-1500}" stopped=0
  while kill -0 "$xc" 2>/dev/null; do
    sleep 5
    waited=$((waited + 5))
    if (( waited >= limit )); then
      stopped=1
      kill "$xc" 2>/dev/null
      break
    fi
  done
  wait "$xc"
  local rc=$?
  if (( stopped )); then
    # The runner is launched suspended; a Mac without Developer Tools access
    # (DevToolsSecurity) never resumes it. Don't leave it behind.
    xcrun simctl terminate "$id" "$BUNDLE.uitests.xctrunner" >/dev/null 2>&1 || true
    echo "UI TESTS STOPPED after ${limit}s — the test runner never started (is Developer Tools access enabled? DevToolsSecurity -status)" >> "$DERIVED.uitest.log"
    rc=124
  fi
  set -e
  # Each accessibility audit issue is one A11Y-ISSUE line (screen, kind,
  # element); then the verdict per test.
  grep -E "A11Y-ISSUE" "$DERIVED.uitest.log" | grep -v "error:" | sort -u | head -120 || true
  grep -E "Test Case .*(passed|failed)|Executed|\*\* TEST|UI TESTS STOPPED" "$DERIVED.uitest.log" | tail -40 || true
  return $rc
}

cmd="${1:-build}"; shift || true
case "$cmd" in
  build) locked "$0" __build "$@" ;;
  test) locked "$0" __test "$@" ;;
  shot) locked "$0" __shot "$@" ;;
  ui-test) locked "$0" __ui_test "$@" ;;
  build-tests) locked "$0" __build_tests "$@" ;;
  reboot-sim) locked "$0" __reboot_sim "$@" ;;
  __build) do_build "$@" ;;
  __test) do_test "$@" ;;
  __shot) do_shot "$@" ;;
  __ui_test) do_ui_test "$@" ;;
  __build_tests) do_build_tests "$@" ;;
  __reboot_sim) do_reboot_sim "$@" ;;
  *) echo "usage: $0 build|test|shot|ui-test|build-tests|reboot-sim …" >&2; exit 2 ;;
esac
