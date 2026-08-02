# Relix

Multi-platform SSH client with port forwarding and SFTP. Desktop (Linux / macOS / Windows) and Android via Tauri 2.

## Stack

- Tauri 2 (Rust) + React 19 + TypeScript
- Tailwind v4 + shadcn
- Bun package manager

## Develop (desktop)

```bash
bun install
bun tauri dev
```

Frontend-only:

```bash
bun run dev
```

### Desktop notes

- Closing the window (title-bar X or Alt+F4) **hides to the system tray**; SSH sessions and tunnels keep running.
- Restore via tray **Show Relix** (or left-click on Windows/macOS). **Quit** from the tray menu exits fully.

## Android

Same Tauri CLI as desktop — mobile is a subcommand:

```bash
bun tauri android init    # once
bun tauri android dev     # emulator or device + hot reload
bun tauri android build   # APK / AAB
```

Open the Gradle project in Android Studio:

```bash
bun tauri android dev --open
```

### Prerequisites

See [Tauri Android prerequisites](https://v2.tauri.app/start/prerequisites/#android):

- Android Studio → SDK Platform, Platform-Tools, NDK (Side by side), Build-Tools, Command-line Tools
- Rust Android targets (or let `tauri android init` install them):
  ```bash
  rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
  ```
- Env (typical Linux):
  ```bash
  export ANDROID_HOME="$HOME/Android/Sdk"
  export NDK_HOME="$ANDROID_HOME/ndk/$(ls -1 "$ANDROID_HOME/ndk" | head -1)"
  export JAVA_HOME="/opt/android-studio/jbr"
  ```

### Mobile notes

- System / gesture back leaves session → hosts (forms close first).
- Import private keys via the file picker (stored as key body, not path).
- Local / dynamic tunnels bind on-device (`127.0.0.1`); enable “listen on all interfaces” for LAN clients. Prefer ports > 1024.
- **Background usage is mandatory on Android.** First launch (and any time grants are missing) shows a non-dismissible prompt for notifications + unrestricted battery. Without that, Android freezes or kills the process and SSH sessions/tunnels die.
- While any host is connected, Relix runs a foreground service with a persistent notification (`Relix is running · sessions active`). **Stop** on that notification disconnects every session.

## Build (desktop)

```bash
bun tauri build
```

## CI / releases

GitHub Actions (`.github/workflows/build.yml`) builds Linux, Windows, macOS (arm64), and Android on:

- manual **workflow_dispatch**
- version tags matching `v*` (creates a **draft** release with installers + APKs)

Optional Android signing secrets (unsigned APK if omitted):

- `ANDROID_KEY_BASE64` — `base64 -w0 upload-keystore.jks`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

## Project map

See `AGENTS.md` and `DESIGN.md` for architecture and design rules.
