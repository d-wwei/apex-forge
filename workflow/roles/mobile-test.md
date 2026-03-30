---
name: apex-forge-mobile-test
description: Test mobile apps on iOS simulator or Android emulator
user-invocable: true
---

```bash
#!/usr/bin/env bash
# Apex Forge — Mobile Test Role Preamble
source "${APEX_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}/hooks/state-helper"

echo "=== APEX MOBILE TEST ROLE ==="
apex_set_stage "mobile-test"

# ---------------------------------------------------------------------------
# Telemetry
# ---------------------------------------------------------------------------
apex_telemetry_start "mobile-test"

# ---------------------------------------------------------------------------
# Platform detection
# ---------------------------------------------------------------------------
IOS_AVAILABLE="false"
ANDROID_AVAILABLE="false"

if command -v xcrun &>/dev/null && xcrun simctl list devices &>/dev/null 2>&1; then
  IOS_AVAILABLE="true"
  echo "[mobile-test] iOS Simulator: available"
else
  echo "[mobile-test] iOS Simulator: not available"
fi

if command -v adb &>/dev/null; then
  ANDROID_AVAILABLE="true"
  echo "[mobile-test] Android (ADB): available"
else
  echo "[mobile-test] Android (ADB): not available"
fi

if [ "$IOS_AVAILABLE" = "false" ] && [ "$ANDROID_AVAILABLE" = "false" ]; then
  echo "[mobile-test] WARNING: No mobile platform tools detected"
fi

echo "IOS_AVAILABLE=$IOS_AVAILABLE"
echo "ANDROID_AVAILABLE=$ANDROID_AVAILABLE"

apex_ensure_dirs
```

# Mobile Test

You are performing mobile app testing using platform simulators and emulators.
Detect the target platform, launch the app, execute test flows, and capture evidence.

## When to use

- User says "test on mobile", "run on simulator", "check on iPhone/Android"
- QA phase needs mobile verification
- After UI changes that affect responsive or native layouts

## Preamble

Before starting, detect the platform and verify tools:

### iOS (macOS only)
```bash
# Check Xcode CLI tools
xcrun simctl list devices 2>/dev/null && echo "iOS: ready" || echo "iOS: not available"
```

### Android
```bash
# Check ADB
adb devices 2>/dev/null && echo "Android: ready" || echo "Android: not available"
```

If neither is available, report and exit. Do NOT attempt to install simulators.

## iOS Testing Flow

### Step 1 — Select simulator

```bash
# List available simulators
xcrun simctl list devices available

# Prefer: iPhone 16, iPhone 15 Pro, or latest available
```

Choose the most recent iPhone model that is available. If user specifies a device, use that.

### Step 2 — Boot simulator

```bash
# Boot by device name (use UDID if name is ambiguous)
xcrun simctl boot "iPhone 16"

# Open Simulator.app to see the screen
open -a Simulator
```

Wait for boot to complete (status changes from "Shutdown" to "Booted").

### Step 3 — Install and launch app

```bash
# Install .app bundle (for simulator builds)
xcrun simctl install booted /path/to/App.app

# Launch by bundle identifier
xcrun simctl launch booted com.example.app

# For web testing, open URL in Safari
xcrun simctl openurl booted "http://localhost:3000"
```

### Step 4 — Capture evidence

```bash
# Screenshot
xcrun simctl io booted screenshot /tmp/ios-test.png

# Video recording (stop with Ctrl+C)
xcrun simctl io booted recordVideo /tmp/ios-test.mp4
```

### Step 5 — Cleanup

```bash
# Shutdown simulator when done
xcrun simctl shutdown booted
```

## Android Testing Flow

### Step 1 — Select device/emulator

```bash
# List connected devices and emulators
adb devices -l

# If no device, list available AVDs
emulator -list-avds
```

### Step 2 — Launch emulator (if needed)

```bash
# Start emulator (headless for CI, or with UI for manual testing)
emulator -avd Pixel_7_API_34 &

# Wait for boot
adb wait-for-device
adb shell getprop sys.boot_completed  # should return "1"
```

### Step 3 — Install and launch app

```bash
# Install APK
adb install /path/to/app.apk

# Launch activity
adb shell am start -n com.example.app/.MainActivity

# For web testing, open Chrome
adb shell am start -a android.intent.action.VIEW -d "http://10.0.2.2:3000"
```

### Step 4 — Capture evidence

```bash
# Screenshot
adb exec-out screencap -p > /tmp/android-test.png

# Screen recording (max 3 min)
adb shell screenrecord /sdcard/test.mp4
# Stop with Ctrl+C, then pull:
adb pull /sdcard/test.mp4 /tmp/android-test.mp4
```

### Step 5 — Cleanup

```bash
# Uninstall test app
adb uninstall com.example.app
```

## QA Checklist

After launching the app, verify these mobile-specific concerns:

### Touch Targets
- [ ] All interactive elements are at least 44x44 pt (iOS) / 48x48 dp (Android)
- [ ] Buttons have adequate spacing — no accidental taps on adjacent elements

### Text Readability
- [ ] Body text is at least 16px equivalent
- [ ] Sufficient contrast ratio (4.5:1 for normal text, 3:1 for large text)
- [ ] Text does not overflow or get clipped on small screens

### Safe Areas
- [ ] Content respects notch / dynamic island (iOS)
- [ ] No content hidden behind navigation bar or status bar
- [ ] Bottom content avoids home indicator zone

### Orientation
- [ ] App renders correctly in portrait
- [ ] If landscape is supported, layout adapts properly
- [ ] Rotation does not lose state

### Performance
- [ ] App launches within 3 seconds
- [ ] Scrolling is smooth (no visible jank)
- [ ] Images load without blocking UI

### Platform Conventions
- [ ] Navigation follows platform patterns (back gesture iOS, back button Android)
- [ ] System font sizes respected (Dynamic Type / font scale)
- [ ] Dark mode renders correctly if supported

## Completion Status

| Status | When |
|--------|------|
| **DONE** | All checklist items pass on target platform(s). Evidence captured. |
| **DONE_WITH_CONCERNS** | Tests pass but minor issues found (cosmetic, non-blocking). |
| **BLOCKED** | No mobile platform tools available, or app cannot be installed/launched. |
| **NEEDS_CONTEXT** | Need app bundle path, target device, or URL to test. |

When finished:
1. Collect all screenshots as evidence
2. Report: platform tested, device used, pass/fail per checklist item

```bash
# End telemetry
apex_telemetry_end "${STATUS}"
```
