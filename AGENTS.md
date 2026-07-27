# AGENTS.md

## Project overview

**Relix** — multi-platform SSH client with port forwarding and SFTP. Desktop (Linux / macOS / Windows) and mobile (iOS / Android) via Tauri. Connection state, tunnels, and file transfer must stay glanceable — dark desk or one-handed phone.

## Tech stack

| Layer | Technology |
|---|---|
| Shell | Tauri 2 (Rust) — desktop + mobile |
| Frontend | React 19 + TypeScript |
| Styling | Tailwind v4 + CSS tokens in `src/index.css` |
| Components | shadcn (base-nova) + Lucide |
| Build | Vite 7 |
| Package manager | Bun |

## Repository map

| Path | Role |
|---|---|
| `src/app/` | Composition root: `App.tsx`, workspace + SSH lifecycle hooks |
| `src/features/hosts/` | Host types, store, CRUD/connect hooks, rail/form/header UI |
| `src/features/forwards/` | Tunnel types, store, start/stop hooks, panel/form UI |
| `src/features/shells/` | Shell sessions, launch menu, xterm terminal panel |
| `src/features/sftp/` | SFTP panel (stub until transfer backend) |
| `src/features/ssh/` | Tauri SSH bridge: commands, errors, events |
| `src/components/ui/` | shadcn primitives — prefer variants, don’t restyle ad hoc |
| `src/components/status/` | Shared status UI (`status-dot`, `session-chip`) |
| `src/components/workspace/` | Workspace chrome (tabs, empty state, form field) |
| `src/lib/utils.ts` | `cn` helper |
| `src-tauri/src/ssh/` | Rust SSH feature: manager, connection, shell, forward |
| `DESIGN.md` | Design system source of truth |

## Design context

Load **DESIGN.md** for any UI work. Summary:

- **Voice:** precise · infrastructural · quiet. Ops language only (host, tunnel, forward, session).
- **Theme:** dark-first Relay Night — cool ink neutrals (hue 250) + signal amber accent (hue 75). OKLCH only.
- **Status language:** mint = connected, cyan = tunnel, amber = transfer, rose = error. Status is never color-only.
- **Desktop (`≥ md`):** host rail + session workspace split.
- **Mobile (`< md`):** list → session drill-in. No squeezed desktop chrome.
- **Density:** high on desktop; ≥44px targets on mobile; safe-area insets on mobile shells.
- **Typography:** Geist (UI) + Geist Mono (hosts, paths, ports, forwards).

### Absolute bans

Side-stripe borders, gradient text, glassmorphism, hero-metric empty states, nested cards, desktop layout forced onto mobile, hover-only affordances.

When adding UI:

1. Use existing tokens / status colors — no one-off hex/oklch.
2. Design desktop **and** mobile structure before shipping a surface.
3. Prefer shell patterns (list, mono row, empty state, sheet) over new layout languages.
4. Primary actions amber; keep semantic status hues pure to their meaning.

## Code conventions

- TypeScript strict; path alias `@/` → `src/`.
- Minimal comments; self-documenting names. One function = one purpose.
- Domain code lives under `src/features/<name>/` (types, store, hooks, components, barrel `index.ts`).
- App composition stays in `src/app/` — no domain logic dumps in `App.tsx`.
- Shared status UI under `src/components/status/`; workspace chrome under `src/components/workspace/`.
- Do not invent new status colors or layout modes outside DESIGN.md.
- SSH IPC surface is `src/features/ssh/` (frontend) and `src-tauri/src/ssh/` (backend). Keep command/event names stable.

## Backend modules (`src-tauri/src/ssh/`)

| Module | Role |
|---|---|
| `commands.rs` | Thin Tauri command adapters |
| `manager.rs` | `SshManager` state maps + disconnect orchestration |
| `connection.rs` | Connect, auth, host-key trust, live connection |
| `shell.rs` | PTY open/write/resize/close + shell command building |
| `forward.rs` | Local / remote / dynamic tunnels |
| `known_hosts.rs` | Host key verification + persistence |
| `socks.rs` | SOCKS5 CONNECT helpers |
| `error.rs` | Serializable `SshError` |

## Commands

```bash
bun install
bun run dev              # Vite only
bun run build            # tsc + vite build
bun tauri dev            # desktop
bun tauri build
bun tauri android init   # once
bun tauri android dev    # Android emulator / device
bun tauri android build  # APK / AAB
```

Android needs SDK/NDK + `ANDROID_HOME` / `NDK_HOME` / `JAVA_HOME` (Studio JBR). See README.md and https://v2.tauri.app/start/prerequisites/#android.
