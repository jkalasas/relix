# Relix Design System

Product design source of truth for Relix — a **multi-platform** SSH client (desktop + mobile) with port forwarding and SFTP. Design serves the task: connection state, tunnels, and file transfer must be glanceable in a dark room at a desk *or* one-handed on a phone.

**Platforms:** Desktop (Linux / macOS / Windows) and mobile (iOS / Android) via Tauri  
**Stack:** Tauri · React · TypeScript · Tailwind v4 · shadcn (base-nova) · Lucide  
**Tokens live in:** `src/index.css`  
**Features live in:** `src/features/` · **App chrome:** `src/app/` + `src/components/{status,workspace}/`

One design system. Two layout modes. Same status language everywhere.

---

## Register

**Product surface.** Design SERVES the product. Not marketing, not brand campaign.

| Decision | Value |
|---|---|
| Strategy | Restrained dark — tinted neutrals + one accent ≤10% |
| Mode | Dark-first (`html.dark`, `color-scheme: dark`). Light is optional later |
| Density | Adaptive — high on desktop, touch-comfortable on mobile. Still not card-grid SaaS |
| Input model | Desktop: keyboard-first, mouse complete. Mobile: thumb-first, large targets |
| Layout | Desktop = split chrome. Mobile = list → session (drill-in) |

### Scenes

**Desktop**

> 11pm, one main monitor, three bastion hosts open. Checking a tunnel is still up, dragging a `.env` over SFTP, glancing at session status without leaving the keyboard. The room is dark. Connection state is what lights up.

**Mobile**

> On-call, one hand on the phone, train light flicker. Open Relix, confirm bastion is still connected, check the DB tunnel, maybe pull a log over SFTP. Thumb zone only. No hover, no tiny rows, no desktop chrome crammed onto a 390px screen.

### References

**Borrow craft from agentic CLI tools (e.g. Terax):** dense workspace on large screens, multi-pane surfaces, themeable terminal culture, keyboard habits where a keyboard exists.

**Anti-references:**

- Soft consumer “mobile SaaS” card stacks (Termius-marketing aesthetic)
- Shrinking the desktop split layout onto a phone and calling it responsive
- Purple AI-agent product UI
- Classic CRT green-on-black as brand identity
- Catppuccin / Tokyo Night / Nord as default identity
- Hero-metric empty states (“3 hosts · 12 tunnels · 99.9%”)
- Glassmorphism, gradient text, side-stripe accent bars

---

## Voice

Three words: **precise · infrastructural · quiet.**

Copy is ops language: host, project, ad hoc, tunnel, forward, session, connect, disconnect. No marketing fluff. Empty states name the next action. Same words on phone and desktop.

---

## Color — Relay Night

OKLCH only. Neutrals tint toward hue **250** (cool ink). Brand accent is **signal amber** (hue **75**) — rack LED, not AI purple.

Same palette on every platform. Status colors are the product language; do not retheme per OS.

### Surfaces

| Token | OKLCH | Role |
|---|---|---|
| `--background` | `oklch(0.145 0.014 250)` | App canvas |
| `--surface` / `--sidebar` | `oklch(0.175 0.016 250)` | Host rail, panel rows |
| `--elevated` / `--popover` | `oklch(0.205 0.018 250)` | Active row, menus, sheets |
| `--border` | `oklch(0.32 0.02 250 / 55%)` | Hairlines |
| `--input` | `oklch(0.28 0.02 250 / 60%)` | Field chrome |

### Type

| Token | OKLCH | Role |
|---|---|---|
| `--foreground` | `oklch(0.93 0.012 250)` | Primary text ≥4.5:1 |
| `--muted-foreground` | `oklch(0.68 0.02 250)` | Labels, secondary — still ≥4.5:1 |
| `--status-idle` | `oklch(0.55 0.02 250)` | Idle / inactive status |

### Brand + status

| Token | OKLCH | Role |
|---|---|---|
| `--primary` | `oklch(0.78 0.145 75)` | CTAs, active tab, focus ring source |
| `--primary-foreground` | `oklch(0.18 0.02 75)` | Text on primary |
| `--ring` | `oklch(0.72 0.12 75)` | Focus rings |
| `--status-connected` | `oklch(0.74 0.13 155)` | SSH live |
| `--status-tunnel` | `oklch(0.74 0.11 220)` | Active port forward |
| `--status-transfer` | `oklch(0.78 0.12 85)` | File transfer in flight |
| `--destructive` | `oklch(0.68 0.18 25)` | Dead host, auth fail, errors |

### Color budget

| Hue | When |
|---|---|
| Amber primary | Connect, New tunnel, primary buttons, active tab indicator |
| Mint connected | Session dots, “connected” chips, healthy host |
| Cyan tunnel | Forward type glyph, active tunnel state |
| Amber transfer | File transfer progress only |
| Rose | Auth fail, unreachable host, broken forward |
| Neutrals | ~90% of pixels |

Never use neutral gray text on a saturated field — use a darker shade of that field’s hue, or a transparency of the text color.

### Tailwind maps

- `bg-surface` · `bg-elevated`
- `text-status-connected` · `text-status-tunnel` · `text-status-transfer` · `text-status-idle`
- `bg-status-*` for dots and tints

shadcn semantic tokens (`primary`, `muted`, `sidebar`, …) are wired to the same system.

---

## Typography

| Role | Family | Usage |
|---|---|---|
| UI | **Geist Variable** | Chrome, labels, buttons, empty-state copy |
| Mono | **Geist Mono Variable** | Host targets, paths, ports, terminal chrome, forward rows |

### Scale

| Step | Size | Weight | Use |
|---|---|---|---|
| Micro | 11px | 500 | Chips, rail section labels, secondary header line |
| Tab / mono body | 12–12.5px | 400–500 | Workspace tabs, terminal lines, forward rows |
| UI body | 13–14px | 400–500 | Host list, empty-state body |
| Title | 14–16px | 600 | Empty-state headings, brand wordmark |

No display hero type in-app. `text-wrap: balance` on empty-state headings; `pretty` on supporting prose.

On mobile, prefer the upper end of body sizes for scanability; do not shrink mono paths below 12px.

---

## Layout & chrome

### Breakpoints

| Mode | Viewport | Shell |
|---|---|---|
| **Mobile** | `< md` (~768px) | Page stack — one primary surface at a time |
| **Desktop** | `≥ md` | Same page stack; file tree rail only inside a connected workspace |

Do not “squeeze” a multi-pane desktop chrome below `md`. Switch density, not structure.

### Navigation stack (all platforms)

```
Hosts page  →  Projects page  →  Workspace
   list            Ad hoc +          shells / files / ports
                   projects
```

| Page | Role |
|---|---|
| **Hosts** | Full-page host catalog (home). Status dots + mono targets. + Host |
| **Projects** | Per-host: **Ad hoc** (default, no project) + saved project directories. Connect / edit host here |
| **Workspace** | Session for one host + scope (Ad hoc or project). Tabs, shells, files, host-level ports |

**Ad hoc** — no saved project. Files follow the active shell cwd (OSC7 / tmux path).
**Project** — saved name + directory on that host. Shells open in that path; files stay rooted there.

Open workspaces stay alive in the background. Jump via **Recents** (header / title bar). Back: workspace → projects → hosts.

Connections are **one SSH session per host**, shared by every project/Ad hoc on that host. Switching scope never reconnects.

### Desktop — workspace chrome

```
Hosts / Projects — full-width pages (no host rail)

Workspace (connected):
┌─────────────────────────────────────────────────────────────┐
│ titlebar: tabs · host/scope · recents · status · win ctrls  │
├────────────┬────────────────────────────────────────────────┤
│ file tree  │ shell / editor / files / ports                 │
│ (optional) │                                                │
└────────────┴────────────────────────────────────────────────┘
```

| Region | Size | Notes |
|---|---|---|
| Title bar | 40px (`2.5rem`) | Frameless window. Tabs + session header + window controls when in workspace. Drag via `data-tauri-drag-region` |
| File tree rail | ~240px default, drag-resizable (180–480px); collapsible | Only on **connected workspace**. Not a host catalog. Hosts link returns to hosts page |
| Session header | 40px desktop / 48px mobile | Host · scope label; chip + connect; back to projects; recents switcher |
| Session tabs | title bar (desktop) / below header (mobile) | Document strip (shells, files, tools); elevated active pill |
| Workspace body | flex-1 | Active tab panel (`SidebarInset`) |

**Desktop window (Tauri):** frameless, default 1180×740, min ~360×560 (below `md`, mobile shell still applies if the window is narrow).

### Mobile — stack drill-in

```
Hosts                        Projects                     Workspace
┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐
│ Relix       [+]  │         │ ← bastion-prod ● │         │ ← host · Ad hoc  │
│ ● bastion-prod › │  ──▶    │ Ad hoc           │  ──▶    │ [shell][file]…   │
│ ○ staging      › │         │ api  /srv/api    │         │ workspace body   │
└──────────────────┘         │ + Project        │         └──────────────────┘
                             └──────────────────┘
```

| Rule | Detail |
|---|---|
| Root | Full-width hosts page |
| Open host | Pushes projects page |
| Open Ad hoc / project | Pushes workspace full-screen |
| Back | Workspace → projects → hosts; Esc / Android back same stack |
| Tabs | Scrollable document tabs; ≥44px tall |
| Tools | Trailing Files / Ports open or focus singleton tool tabs |
| Primary actions | Thumb zone when possible |
| Safe areas | `env(safe-area-inset-*)` on notch/home-indicator devices |
| Sheets / forms | Full-screen or bottom sheet — not tiny centered modals |

### Feature surfaces (all platforms)

1. **SSH / Terminal** — session readiness and PTY. Disconnected/error states explain next step and offer Connect / Retry. On mobile, terminal is full-bleed; soft keyboard must not permanently bury the prompt (scroll + visual viewport). Mobile OS (Android/iOS) shows a bottom accessory key bar (Esc, Ctrl, Alt, Shift, Tab, arrows) with sticky modifiers for the next soft-keyboard key.
2. **Port forwards** — **host-level** (shared across Ad hoc + projects). Desktop: multi-column mono row. Mobile: stacked row. L / R / D as before. Cyan on active only.
3. **Files** — path in mono. **Ad hoc:** browser follows shell cwd. **Project:** rooted at project path. Desktop: file tree in left rail while workspace is connected; main pane is shell/editor/Files empty. Mobile: single-pane list + transfer sheet. Local host and remote hosts share the same Files surface.

### Empty states

Task-specific, one primary action, no fake metrics. Icon in a quiet bordered tile, short title, one sentence of guidance, single CTA. Same pattern on phone and desktop; only padding and max-width change.

### Elevation & radius

- Elevation via surface step + hairline border. Prefer borders over shadows. No blur glass.
- `--radius: 0.5rem` (tool, not marketing).

---

## Components

| Component | Path | Role |
|---|---|---|
| `StatusDot` | `components/status/status-dot.tsx` | Host/session status glyph + accessible label |
| `SessionChip` | `components/status/session-chip.tsx` | Connected / idle / error pill |
| `HostsPage` | `features/projects/components/hosts-page.tsx` | Full-page host catalog |
| `ProjectsPage` | `features/projects/components/projects-page.tsx` | Per-host Ad hoc + project list |
| `ProjectForm` | `features/projects/components/project-form.tsx` | Create / edit project directory |
| `WorkspaceRecents` | `features/projects/components/workspace-recents.tsx` | Jump between open workspaces |
| `AppSidebar` | `features/hosts/components/app-sidebar.tsx` | Desktop file-tree rail (workspace only) |
| `SessionHeader` | `features/hosts/components/session-header.tsx` | Host · scope + status + connect; back to projects |
| `SessionTabBar` | `components/workspace/session-tab-bar.tsx` | Document tabs: shells · open files · Files · Ports |
| `TerminalPanel` | `features/shells/components/terminal-panel.tsx` | Shell workspace |
| `FilesPanel` | `features/files/components/files-panel.tsx` | Mobile file list browser / transfer |
| `FileTreeSidebar` | `features/files/components/file-tree-sidebar.tsx` | Desktop file tree content inside `AppSidebar` |
| `FilesWorkspace` | `features/files/components/files-workspace.tsx` | Files empty pane + open file slot; mobile list host |
| `FileWorkspace` | `features/files/components/file-workspace.tsx` | Open file editor / preview tab |
| `ForwardsPanel` | `features/forwards/components/forwards-panel.tsx` | Tunnel list / empty (host-level) |
| `EmptyState` | `components/workspace/empty-state.tsx` | Shared empty pattern (icon tile · title · guidance · CTA) |
| `Button` / `Input` / `Sidebar` | `components/ui/*` | shadcn CLI primitives — do not hand-edit; compose via variants / className / CSS tokens |

### Status mapping

| `HostStatus` | Dot / chip |
|---|---|
| `connected` | mint `--status-connected` |
| `idle` | muted `--status-idle` |
| `error` | rose `--destructive` |

| `ForwardStatus` | Text |
|---|---|
| `active` | cyan `--status-tunnel` |
| `idle` | `--status-idle` |
| `error` | rose `--destructive` |

---

## Motion

| Kind | Duration | Easing |
|---|---|---|
| Chrome hover / tab underline | 150ms | ease-out |
| Mobile list → session | 200–280ms | ease-out expo/quart (transform + opacity) |
| Panel crossfade (if needed) | 120–200ms | ease-out |

- Animate `opacity` / `transform` only.
- No bounce, no elastic, no iOS-spring parody.
- `@media (prefers-reduced-motion: reduce)` → instant or simple crossfade (global rule in `index.css`).
- Reveals never gate content visibility.

---

## Interaction & a11y

### Desktop shortcuts

| Shortcut | Action |
|---|---|
| `Esc` | Back one page (form → previous; workspace → projects → hosts) |
| `1` | Focus last shell tab (or open a shell) — workspace only |
| `2` | Open / focus Files — workspace only |
| `3` | Open / focus Ports — workspace only |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Next / previous session tab |
| `Ctrl/Cmd` + `=` / `-` | Zoom terminal font in / out |
| `Ctrl/Cmd` + `0` | Reset terminal font |
| Pinch / Ctrl+scroll | Zoom terminal font |

Shortcuts are desktop accelerators. Mobile relies on visible controls and pinch zoom — never shortcut-only.

### Targets & input

| Context | Rule |
|---|---|
| Desktop rows | ≥36px height ok with density |
| Mobile rows / tabs / icon buttons | ≥44×44px hit area |
| Focus | Amber `--ring`; never remove without replacement |
| Status | Never color-only — chips + `aria-label` on dots |
| Tabs | `role="tablist"`, `aria-selected`, `aria-controls` ↔ panel ids |
| Hover | Enhancement only — every action works with tap/keyboard |
| Safe area | Top/bottom padding uses safe-area insets on mobile shells |

### Platform notes

- **Desktop:** multi-window later is optional; single window is the default product.
- **Mobile:** system back / gesture back walks the stack: workspace → projects → hosts.
- **Both:** offline / reconnect states use the same status colors; copy stays plain.

---

## Absolute bans

1. Side-stripe colored borders on cards/rows  
2. Gradient text (`background-clip: text`)  
3. Decorative glassmorphism  
4. Hero-metric dashboard templates  
5. Identical icon+heading+text card grids  
6. Tiny uppercase tracked eyebrows on every section  
7. Numbered section markers as default scaffolding  
8. Nested cards  
9. Desktop split layout forced onto mobile widths  
10. Hover-only affordances  

---

## Implementation map

| Concern | Location |
|---|---|
| Color + type tokens | `src/index.css` |
| Domain types | `src/features/*/types.ts` |
| Feature hooks + UI | `src/features/{hosts,forwards,shells,files,ssh,android-background}/` |
| App orchestration (incl. mobile pane) | `src/app/App.tsx` |
| Dark default | `index.html` → `class="dark"` |
| Desktop window chrome | `src-tauri/tauri.conf.json` |

When adding UI:

1. Use existing tokens and status colors — don’t invent one-off hex/oklch.
2. Design desktop **and** mobile structure before shipping a surface.
3. Prefer shell patterns (list, mono row, empty state, sheet) over new layout languages.
4. Keep primary actions amber; keep semantic status hues pure to their meaning.
5. Match neighboring disclosure patterns across platforms.

---

## Open product work (design-adjacent)

- [x] Add / edit host form (auth method, keys, import key on mobile) — full-screen on mobile
- [x] Real PTY terminal themed to Relay Night (soft-keyboard safe on mobile via visualViewport)
- [x] SFTP browser + transfer status (mobile single-pane; desktop tree in host rail + editor)
- [x] Forward editor (local L + bind address + auto-start)
- [x] Remote (R) and dynamic SOCKS (D) forwards
- [ ] Command palette on desktop (`⌘K`); mobile search sheet for hosts
- [x] System back integration on Android
- [ ] System back / gesture polish on iOS
- [x] Android project scaffold (`tauri android init`)
- [x] Android mandatory background gate + session keepalive notification (Stop ends all sessions)
- [ ] Optional light theme (true off-white chroma-0 + same amber)

---

## Changelog

| Date | Change |
|---|---|
| 2026-03-26 | Initial system: Relay Night, shell IA, tokens, status language |
| 2026-03-26 | Multi-platform: desktop split + mobile list/detail, touch & safe-area rules |
| 2026-03-27 | Android scaffold, system back, key import, SFTP, soft-keyboard terminal |
| 2026-03-28 | Android background gate + FGS keepalive while hosts connected |
| 2026-03-28 | Mobile terminal accessory key bar + soft-keyboard re-focus fix |
| 2026-03-28 | Desktop SFTP: file tree in host rail + editor empty pane |
| 2026-03-29 | Desktop shadcn Sidebar shell (collapsible icon); mobile keeps list → session |
| 2026-03-29 | Desktop frameless title bar: tabs + window controls span full window chrome |
