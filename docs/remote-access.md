# Remote access

The app runs behind one entry point, the `proxy` service (nginx). The web app, REST API,
streamed chat, admin, and live-talk WebSockets all share a single address, so it behaves the
same locally and on other devices, like a hosted application.

| Address | Use |
|---|---|
| http://localhost:3000 | Local use (chat and admin) |
| http://127.0.0.1:8090 | Same app, localhost-only; for tunnels already pointed at it |

Point any HTTPS tunnel at either port. Phones and other devices **need HTTPS** for the
microphone (dictation and live talk); both tunnels below provide it.

## Public demo link (localhost.run)

```powershell
.\ops\start-demo-tunnel.ps1
```

The HTTPS URL appears in `%TEMP%\incomoco-public-tunnel\stdout.log`. Stop it with the
`Stop-Process` command the script prints.

## Private sharing (Tailscale)

```powershell
tailscale serve --bg --https=8443 http://127.0.0.1:3000
```

Colleagues need Tailscale and access to this device under your tailnet policy. For a public
Tailscale link use `tailscale funnel` instead of `serve`. Stop with
`tailscale serve --https=8443 off` (or `tailscale funnel --https=8443 off`).

## Before sharing publicly

- **Change the demo admin password.** Admin is reachable through the shared address. Set a
  strong `ADMIN_PASSWORD` in `.env`, then run `docker compose up -d api`.
- **Anyone with a public link can chat** and use your OpenRouter credits. Stop the tunnel when
  the demo is over.
- Keep the computer awake, Docker running, and the internet connected.
- Never port-forward the database, Weaviate, or MinIO ports on your router.

## How it works

- The browser calls `/api/v1/...` on the same address it loaded the page from
  (`NEXT_PUBLIC_API_URL=same-origin`), so no tunnel-specific configuration is needed.
- The live-talk WebSocket accepts connections whose `Origin` matches the address they were sent
  to, plus `TRUSTED_ORIGIN_PATTERNS` (default `*.lhr.life,*.*.ts.net`) for tunnels that rewrite
  the `Host` header. Other websites are refused.
- The Next.js dev server allows the same tunnel domains (`allowedDevOrigins` in
  `apps/web/next.config.ts`); without that, pages load but nothing is clickable.
- The API trusts `X-Forwarded-For` from the proxy, so rate limits apply per visitor.
