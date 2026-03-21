# LobSmash Coach

**Your padel coach lives in WhatsApp.** Built for the [Vercel × Google DeepMind hackathon](https://vercel.com) — real-time coaching, memory, and duo play — without leaving the chat app you already use.

![Next.js](https://img.shields.io/badge/Next.js-15-black?style=flat&logo=next.js)
![Gemini](https://img.shields.io/badge/Gemini-3%20Flash-4285F4?style=flat&logo=google)
![WhatsApp](https://img.shields.io/badge/WhatsApp-Kapso-25D366?style=flat&logo=whatsapp)

## Why this exists

Padel is fast, technical, and social. Generic AI chat feels cold; a coach in **WhatsApp** meets players where they plan matches, share clips, and trash-talk friends. LobSmash Coach uses **Gemini** for multimodal reasoning (text + images/video) and **structured coaching** so every reply is actionable — not a wall of text.

## What you get

- **WhatsApp-native coach** — Inbound messages via [Kapso](https://kapso.ai) webhooks; signed, production-style delivery to Next.js.
- **Consistent playbook** — Every answer uses four sections: *What went wrong* → *What to fix* → *Drill* → *Goal for next time* (easy to scan on a phone).
- **Multimodal feedback** — Send a photo or clip of your swing; the coach comments on what it sees.
- **Solo & duo modes** — Practice alone or pair with a partner; “before the match” / “after the match” steers **duo pre** vs **duo post** debriefs.
- **Partner pairing** — Message with “partner” + a phone number to start pairing; the other player confirms with `PAIR <CODE>` (see `SANDBOX.md`).
- **Playtomic-aware** — Tools surface booking links; the bot never invents live court availability (honest logistics).

## Architecture

```mermaid
flowchart LR
  WA[WhatsApp user] --> Kapso[Kapso Cloud API]
  Kapso -->|POST signed webhook| API["/api/webhooks/whatsapp"]
  API --> Gemini[Gemini 3 Flash]
  API --> DB[(SQLite + Drizzle)]
  Gemini --> Tools[Function tools: memory, duo, Playtomic]
  API --> Kapso
  Kapso --> WA
```

- **Framework:** [Next.js 15](https://nextjs.org) (App Router) — deploy on Vercel in one click.
- **Model:** `gemini-3-flash-preview` via `@google/genai` (Interactions-style multimodal input).
- **Data:** SQLite (`better-sqlite3`) + Drizzle ORM — sessions, memory, duo pairing.
- **Messaging:** `@kapso/whatsapp-cloud-api` for sends and media download.

## Quick start

1. Clone and install:

   ```bash
   git clone https://github.com/trenchsheikh/lobsmash-whatsapp.git
   cd lobsmash-whatsapp
   npm install
   ```

2. Copy env and fill secrets:

   ```bash
   cp .env.example .env.local
   ```

   Set `GEMINI_API_KEY`, Kapso keys, `KAPSO_WEBHOOK_SECRET`, and `WHATSAPP_PHONE_NUMBER_ID`. See **`SANDBOX.md`** for webhook URL, pairing flow, and end-to-end checks.

3. Prepare the database:

   ```bash
   npm run db:push
   ```

4. Run locally:

   ```bash
   npm run dev
   curl http://localhost:3000/api/health
   ```

5. Point Kapso’s phone-number webhook at `https://<your-host>/api/webhooks/whatsapp` (ngrok, Cloudflare Tunnel, or Vercel preview).

## Deploy on Vercel

- Import the repo, set the same environment variables in the Vercel project settings.
- Use a persistent store in production if you outgrow SQLite on serverless (e.g. Turso, Neon, or Vercel Postgres) — the Drizzle schema in `lib/db/` is a small migration away.

## Project layout

| Path | Role |
|------|------|
| `app/api/webhooks/whatsapp/route.ts` | Kapso webhook handler |
| `lib/coach/run-lob-smash.ts` | Gemini coach loop + tools |
| `lib/lobsmash-system-prompt.ts` | Modes: solo, duo pre/post |
| `lib/partner-flow.ts` | Partner pairing |
| `lib/db/` | Schema & queries |

## License & hackathon

Built as a hackathon demo — iterate freely. If LobSmash helps your game, share the repo and your best bandeja clip.

---

*Not affiliated with Playtomic, WhatsApp, or Meta. Padel: stay low, finish the volley.*
