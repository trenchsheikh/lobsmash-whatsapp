export type PlaytomicHelpInput = {
  city?: string;
  country?: string;
  intent?: "book_court" | "find_open_match";
  date_hint?: string;
};

export function buildPlaytomicHelpMessage(input: PlaytomicHelpInput): string {
  const place =
    [input.city, input.country].filter(Boolean).join(", ") || "your area";
  const when = input.date_hint?.trim() || "soon";

  return [
    "Playtomic links (availability is live in the app/site — always double-check there):",
    "",
    `• Main: https://playtomic.io/`,
    `• Global directory (find clubs): https://directory.playtomic.io/`,
    "",
    `Intent: ${input.intent ?? "book or find games"} for ${place}, timing: ${when}.`,
    "",
    "Open Playtomic on your phone while online, pick location + sport (padel), then choose date/time. Slots change in real time — the coach can't see live courts from here.",
  ].join("\n");
}
