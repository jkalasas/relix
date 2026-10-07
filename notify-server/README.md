# relix-notify — host-side notification relay

Loopback-only relay that runs **on the SSH host** (not on the Relix device).
Host apps `POST /send-notification`; connected Relix instances stream `GET /events` (SSE) over an ephemeral Relix port-forward. No database — in-memory broadcast only. If the relay isn't running, Relix silently does nothing.

- Default port: `127.0.0.1:41237` (`--port` / `RELIX_NOTIFY_PORT` overrides)
- `POST /send-notification` → `202 {"ok":true}` (also `202` with zero subscribers)
- `GET /events` → `text/event-stream`, frames: `data: {"id":"…","tabId":"shell:<uuid>","title":"…","body":"…"}`
- `GET /healthz` → `200 {"ok":true}`

## Run on the host

```bash
cargo build --release -p relix-notify
./target/release/relix-notify &          # or --port 41237
curl http://127.0.0.1:41237/healthz
```

systemd example:

```ini
[Unit]
Description=relix-notify relay
After=network.target

[Service]
ExecStart=%h/.local/bin/relix-notify
Restart=on-failure

[Install]
WantedBy=default.target
```

## Send from a host app

```bash
curl -X POST http://127.0.0.1:41237/send-notification \
  -H 'Content-Type: application/json' \
  -d "{\"id\":\"$(uuidgen)\",\"tabId\":\"$_RELIX_TAB_ID\",\"title\":\"build done\",\"body\":\"cargo test passed\"}"
```

`$_RELIX_TAB_ID` is exported by Relix into every shell PTY (e.g. `shell:3f…`).
`id` is a caller-supplied dedupe key; `tabId` routes to the originating tab.

## Logging

All logs go to stderr as `[unix-secs.millis] relix-notify LEVEL: message`:

- `INFO`: startup (port, pid), subscriber connect/leave, every accepted
  notification with its `id`, `tabId`, and subscriber count (or `dropped`).
- `WARN`: rejected payloads, unknown routes, oversized requests, lagged
  subscribers, connection errors.
- `DEBUG` (opt-in): connects/disconnects, `OPTIONS`, `/healthz`, per-event
  delivery. Enable with `--verbose` / `-v` or `RELIX_NOTIFY_VERBOSE=1`.
