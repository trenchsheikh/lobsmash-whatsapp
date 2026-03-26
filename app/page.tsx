export default function Home() {
  return (
    <main className="min-h-screen p-8 max-w-lg mx-auto">
      <h1 className="text-2xl font-semibold tracking-tight">LobSmash Coach</h1>
      <p className="mt-3 text-neutral-600 dark:text-neutral-400">
        WhatsApp-first padel coach. Chat on WhatsApp — this page is only a health check for operators.
      </p>
      <ul className="mt-6 list-disc pl-5 text-sm text-neutral-700 dark:text-neutral-300 space-y-2">
        <li>
          <code className="bg-neutral-100 dark:bg-neutral-800 px-1 rounded">GET /api/health</code> —
          liveness
        </li>
        <li>
          <code className="bg-neutral-100 dark:bg-neutral-800 px-1 rounded">POST /api/webhooks/whatsapp</code>{" "}
          — Wassist BYOA inbound
        </li>
      </ul>
    </main>
  );
}
