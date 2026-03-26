/** Curated copy for gear / communities — expand over time or replace with RAG. */

export type RecommendationCategory = "racket" | "clothing" | "community" | "general";

export function getPadelRecommendationText(
  category: RecommendationCategory,
  opts: { level?: string; region?: string },
): string {
  const level = opts.level?.trim() || "not specified";
  const region = opts.region?.trim() || "your area";

  if (category === "racket") {
    return [
      "Racket ideas (general — try before you buy at a club or shop):",
      "",
      "• Beginners: round or round-hybrid shape, softer foam — forgiving sweet spot, easier defense.",
      "• Intermediate: teardrop or hybrid for power + some control; stiffer core if you like volleys.",
      "• Advanced: often diamond or aggressive hybrids for attack; weight ~365–375g is common (personal fit matters).",
      "",
      `You said level: ${level}. Brands people talk about a lot include Head, Bullpadel, Adidas, Nox, Starvie — but balance and feel beat logos.`,
      "Ask a local pro shop to let you hit 2–3 demos for 10 minutes each.",
    ].join("\n");
  }

  if (category === "clothing") {
    return [
      "Padel clothing — practical picks:",
      "",
      "• Shoes: **padel-specific** soles (herringbone / mixed) for artificial turf + lateral stops — running shoes slip.",
      "• Apparel: breathable layers, shorts/skirts with pockets for balls; avoid cotton for long sessions.",
      "• Extras: cap/visor, sweatbands, spare grip if you tear through them.",
      "",
      `Region hint: ${region} — check what your club stocks and what weather demands (indoor vs outdoor).`,
    ].join("\n");
  }

  if (category === "community") {
    return [
      "Finding your people:",
      "",
      "• Start at your home club: ladders, mixers, WhatsApp groups at the desk.",
      `• Apps: Playtomic / similar for ${region} — open matches and levels.`,
      "• Social: local padel Facebook groups, Reddit r/padel, city sports Meetups.",
      "• Be explicit about level (honest bandeja / smash level) so matches stay fun.",
    ].join("\n");
  }

  return [
    "Padel social + gear: mix club nights, app open matches, and one steady practice partner.",
    `Level: ${level}. Region: ${region}.`,
  ].join("\n");
}
