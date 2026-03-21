# LobSmash Coach — sandbox testing

## Webhook URL: do not use `localhost`

Kapso runs **in the cloud**. If you set the webhook to `http://localhost:3000/api/webhooks/whatsapp`, Kapso tries to open port 3000 **on its own servers**, not your PC — you get **connection refused** and no bot reply.

**Use a public HTTPS URL** that reaches your machine:

1. Start the app: `npm run dev` or `npm run start` (port **3000**).
2. Start a tunnel, for example:
   - **ngrok:** `ngrok http 3000` → copy the `https://….ngrok-free.app` URL  
   - **Cloudflare Tunnel:** `cloudflared tunnel --url http://localhost:3000`
3. In Kapso **Webhook Configuration**, set:

   `https://<your-tunnel-host>/api/webhooks/whatsapp`

4. Redeploy or restart the tunnel whenever your URL changes (ngrok free URLs change each run unless you use a reserved domain).

**HTTPS** is required for production webhooks; tunnels provide HTTPS to your local server.

## Prerequisites

1. **Gemini API key** — set `GEMINI_API_KEY` in `.env` (or `.env.local`).
2. **`DATABASE_URL`** — Supabase PostgreSQL session pooler URI (same variable on Vercel).
3. **Kapso** — `kapso login`, then connect a WhatsApp number (`kapso setup` per [integrate-whatsapp skill](../.agents/skills/integrate-whatsapp/SKILL.md)).
4. **IDs** — resolve `phone_number_id` and put it in `WHATSAPP_PHONE_NUMBER_ID`.
5. **Webhook** — create a phone-number webhook pointing to  
   `https://<your-host>/api/webhooks/whatsapp` (use ngrok, Cloudflare Tunnel, or Vercel preview).  
   **Subscribe only to `whatsapp.message.received`** for this URL. If you also enable `whatsapp.message.sent`, `delivered`, or `read`, Kapso will POST those events too; the handler returns `parsed: 0` and `coachRan: false` (that is normal, not a coach failure).  
   Set `KAPSO_WEBHOOK_SECRET` in Kapso and the same value in env.
6. **Batching** — Kapso may send `data` as an array (`batch: true`). The handler expands each item and processes every inbound message.

## Verify locally

```bash
npm install
npm run dev
curl http://localhost:3000/api/health
```

## End-to-end

1. Message your connected WhatsApp business number — first `hi`-style message with no saved memory gets a short **LobSmash** welcome; real coaching replies use the four sections (*What went wrong*, …).
2. Send an image — coach should comment (media download uses Kapso + `phone_number_id`).
3. **Partner flow** — User A: message including “partner” and an international phone number.  
   User B: `PAIR <CODE>` from the instructed phone.
4. **Duo modes** — after pairing, try messages with “before the match” / “after the match” to steer `duo_pre` vs `duo_post`.

## Troubleshooting

- **No reply after a failed run** — older builds marked messages as processed *before* sending. In Supabase, truncate or delete rows from `processed_messages` for stuck `wamid`s (Table Editor or SQL), then message again.
- Check server logs for `skip duplicate webhook delivery` (means that `wamid` was already processed).

## Notes

- Playtomic: the bot only sends links; it cannot see live court availability.
- WhatsApp groups are **not** auto-created in this build — users can create a group manually and add the business number (see partner confirmation message).
