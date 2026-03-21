# LobSmash Coach — sandbox testing

## Prerequisites

1. **Gemini API key** — set `GEMINI_API_KEY` in `.env.local`.
2. **Kapso** — `kapso login`, then connect a WhatsApp number (`kapso setup` per [integrate-whatsapp skill](../.agents/skills/integrate-whatsapp/SKILL.md)).
3. **IDs** — resolve `phone_number_id` and put it in `WHATSAPP_PHONE_NUMBER_ID`.
4. **Webhook** — create a phone-number webhook for `whatsapp.message.received` pointing to  
   `https://<your-host>/api/webhooks/whatsapp` (use ngrok, Cloudflare Tunnel, or Vercel preview).  
   Set `KAPSO_WEBHOOK_SECRET` in Kapso and the same value in env.
5. **Batching** — Kapso may send `data` as an array (`batch: true`). The handler expands each item and processes every inbound message.

## Verify locally

```bash
npm install
npm run dev
curl http://localhost:3000/api/health
```

## End-to-end

1. Message your connected WhatsApp business number — you should get a coach reply (four sections).
2. Send an image — coach should comment (media download uses Kapso + `phone_number_id`).
3. **Partner flow** — User A: message including “partner” and an international phone number.  
   User B: `PAIR <CODE>` from the instructed phone.
4. **Duo modes** — after pairing, try messages with “before the match” / “after the match” to steer `duo_pre` vs `duo_post`.

## Notes

- Playtomic: the bot only sends links; it cannot see live court availability.
- WhatsApp groups are **not** auto-created in this build — users can create a group manually and add the business number (see partner confirmation message).
