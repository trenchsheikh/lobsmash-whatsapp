# LobSmash Coach — sandbox testing

## Webhook URL: do not use `localhost`

Wassist runs **in the cloud**. If you set the webhook to `http://localhost:3000/api/webhooks/whatsapp`, it cannot reach your PC — you get **connection refused** and no bot reply.

**Use a public HTTPS URL** that reaches your machine:

1. Start the app: `npm run dev` or `npm run start` (port **3000**).
2. Start a tunnel, for example:
   - **ngrok:** `ngrok http 3000` → copy the `https://….ngrok-free.app` URL  
   - **Cloudflare Tunnel:** `cloudflared tunnel --url http://localhost:3000`
3. In [Wassist](https://wassist.app) create a **Bring Your Own Agent** and set the webhook to:

   `https://<your-tunnel-host>/api/webhooks/whatsapp`

4. Redeploy or restart the tunnel whenever your URL changes (ngrok free URLs change each run unless you use a reserved domain).

**HTTPS** is required for production webhooks; tunnels provide HTTPS to your local server.

## Prerequisites

1. **Gemini API key** — set `GEMINI_API_KEY` in `.env` (or `.env.local`).
2. **`DATABASE_URL`** — Supabase PostgreSQL session pooler URI (same variable on Vercel).
3. **Wassist** — Create a BYOA agent with the webhook URL above; connect WhatsApp per [Wassist docs](https://docs.wassist.app/guides/connect-whatsapp).
4. **Webhook security (recommended)** — Set `WASSIST_WEBHOOK_SECRET` and send matching `X-Webhook-Signature` (HMAC-SHA256 hex of raw body), **or** use `WASSIST_WEBHOOK_HEADER_NAME` / `WASSIST_WEBHOOK_HEADER_VALUE` if your setup supports a shared header.
5. **Playtomic API (optional)** — Venue credentials from Playtomic Manager → Developer tools; set `PLAYTOMIC_CLIENT_ID`, `PLAYTOMIC_CLIENT_SECRET`, and optionally `PLAYTOMIC_API_PROBE_PATH` to verify connectivity.

## How replies are sent

The handler waits for the coach, then returns JSON `{ "type": "message", "content": "<reply>" }` so Wassist can relay it to WhatsApp. Very long replies send the first chunk in that response and the rest via `reply_callback`.

## Video → Pro (WhatsApp template)

When someone **asks** (text only) about uploading or sending video — before they’ve attached a clip — the webhook can return a **Wassist template** payload (same shape as [Send Message](https://docs.wassist.app/api-reference/conversations/messages/send)): `type: "template"` with `template.name` and `template.variables`.

1. Create and **publish** a template in Wassist / Meta for your WABA (body copy + any `{{1}}` placeholders).
2. Set `LOBSMASH_VIDEO_PRO_TEMPLATE_NAME` to that template’s name.
3. Set `LOBSMASH_VIDEO_PRO_TEMPLATE_VARIABLES_JSON` if your template has variables (e.g. `{"body":["https://lobsmash.com"]}`). If unset, the app sends `variables.body: [LOBSMASH_PRO_URL]`.
4. If `LOBSMASH_VIDEO_PRO_TEMPLATE_NAME` is **not** set, the app falls back to a normal text message with the upgrade link.

When they **send** a video, the app does **not** download it for Gemini; it passes Wassist’s **hosted video URL** in the coach prompt as text (see [`lib/coach/run-lob-smash.ts`](lib/coach/run-lob-smash.ts)).

## Verify locally

```bash
npm install
npm run dev
curl http://localhost:3000/api/health
```

## End-to-end

1. Message your connected WhatsApp business number — first `hi`-style message with no saved memory gets a short **LobSmash** welcome; follow-ups stay conversational unless you ask for a deep breakdown.
2. Send an image — coach should comment (media is fetched from the `image` URL Wassist sends).
3. **Partner flow** — User A: message including “partner” and an international phone number.  
   User B: `PAIR <CODE>` from the instructed phone.
4. **Duo modes** — after pairing, try messages with “before the match” / “after the match” to steer `duo_pre` vs `duo_post`.

## Troubleshooting

- **No reply after a failed run** — on error the idempotency row may be removed so you can retry. Check server logs.
- Check server logs for `skip duplicate webhook delivery` (another worker already claimed that delivery id).

## Notes

- Playtomic: without API credentials, the bot only augments with links; with credentials + `PLAYTOMIC_API_PROBE_PATH`, it can show a real API response for your org’s configured route.
- WhatsApp groups are **not** auto-created in this build — users can create a group manually and add the business number (see partner confirmation message).
