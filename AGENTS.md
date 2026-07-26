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
| `src/App.tsx` | Shell orchestration (desktop split + mobile list/detail) |
| `src/index.css` | Design tokens (Relay Night) |
| `src/lib/types.ts` | Domain types (`Host`, `PortForward`, statuses) |
| `src/lib/seed.ts` | Fixture data for UI work |
| `src/components/shell/` | App chrome: host rail, session, workspace panels |
| `src/components/ui/` | shadcn primitives — prefer variants, don’t restyle ad hoc |
| `src-tauri/` | Tauri/Rust backend |
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
- Domain types live in `src/lib/types.ts`.
- Shell components under `src/components/shell/`; shared status UI next to them (`status-dot`, `session-chip`).
- Do not invent new status colors or layout modes outside DESIGN.md.
- Frontend currently uses seed/fixture state — real SSH/SFTP/PTY will land via Tauri commands in `src-tauri`.

## Commands

```bash
bun install
bun run dev          # Vite only
bun run build        # tsc + vite build
bun run tauri dev    # full Tauri app
bun run tauri build
```
