import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "lobsmash-coach",
    time: new Date().toISOString(),
    /** Helps confirm Vercel env without connecting to the DB. */
    databaseUrlConfigured: Boolean(process.env.DATABASE_URL),
    geminiConfigured: Boolean(
      process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY,
    ),
    kapsoConfigured: Boolean(process.env.KAPSO_API_KEY),
  });
}
