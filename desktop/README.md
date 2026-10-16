# Rijden — Rit — desktop app

The cloud build produces a **Mac `.dmg`** and a **Windows `.exe`** (Artifacts
on the GitHub Actions run). These are unsigned, so the operating system
guards them on first launch. That's expected — not corruption.

## macOS — "App is damaged" / "can't be opened"
macOS quarantines unsigned apps downloaded from the internet. To open YOUR
OWN copy, clear the quarantine flag once, then open normally:

```bash
xattr -cr "/Applications/Rijden — Rit.app"   # or wherever you put it
```

(Or right-click the app -> Open the first time.)

## Windows — "Windows protected your PC" (SmartScreen)
Click **More info -> Run anyway**.

## Distributing to OTHER people without warnings
You need real signing: an Apple Developer ID + notarization (macOS) and an
Authenticode certificate (Windows). Add those to the desktop build config
(electron-builder `mac.notarize` / `win.certificateFile`) when you're ready.
