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
- Background Android may pause listeners when the app is not foreground.

## Build (desktop)

```bash
bun tauri build
```

## Project map

See `AGENTS.md` and `DESIGN.md` for architecture and design rules.
