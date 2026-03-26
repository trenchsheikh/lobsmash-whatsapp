import { createUserContent, GoogleGenAI, type Part } from "@google/genai";
import { shouldGiveOnboardingIntro } from "./conversation";
import { buildSystemInstruction } from "../lobsmash-system-prompt";
import { LOBSMASH_TOOLS, executeToolCall } from "./tools";
import type { CoachContext } from "./types";
import * as q from "../db/queries";

const MODEL_PRIMARY = "gemini-3-flash-preview";
const MODEL_FALLBACK = "gemini-2.5-flash";
/** Used only if Interactions API fails entirely. Tried in order; override first with GEMINI_GENERATE_FALLBACK_MODEL. */
const GENERATE_FALLBACK_MODELS = Array.from(
  new Set(
    [
      process.env.GEMINI_GENERATE_FALLBACK_MODEL,
      "gemini-2.5-flash",
      "gemini-2.0-flash",
    ].filter((m): m is string => Boolean(m)),
  ),
);

type InteractionState = {
  id: string;
  status: string;
  outputs?: unknown[];
};

type TextContent = { type: "text"; text: string };
type ImageContent = {
  type: "image";
  data?: string;
  mime_type?: "image/png" | "image/jpeg" | "image/webp" | "image/heic" | "image/heif";
};
type VideoContent = {
  type: "video";
  data?: string;
  mime_type?:
    | "video/mp4"
    | "video/mpeg"
    | "video/mov"
    | "video/avi"
    | "video/webm"
    | "video/3gpp";
};
type FunctionCallContent = {
  type: "function_call";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};
type FunctionResultContent = {
  type: "function_result";
  call_id: string;
  name?: string;
  /** String or structured output per Gemini Interactions API */
  result: unknown;
};
type ContentPart = TextContent | ImageContent | VideoContent | FunctionResultContent;

function isText(o: unknown): o is TextContent {
  return typeof o === "object" && o !== null && (o as TextContent).type === "text";
}
function isFunctionCall(o: unknown): o is FunctionCallContent {
  return typeof o === "object" && o !== null && (o as FunctionCallContent).type === "function_call";
}

function extractTextFromOutputs(outputs: unknown[] | undefined): string {
  if (!outputs?.length) return "";
  const lines: string[] = [];
  for (const o of outputs) {
    if (isText(o)) lines.push(o.text);
  }
  return lines.join("\n").trim();
}

function getFunctionCalls(outputs: unknown[] | undefined): FunctionCallContent[] {
  if (!outputs) return [];
  return outputs.filter(isFunctionCall);
}

/** Interactions may return in_progress / incomplete; poll briefly until ready. */
async function waitUntilInteractionReady(
  ai: GoogleGenAI,
  interaction: InteractionState,
): Promise<InteractionState> {
  let current = interaction;
  let n = 0;
  const max = 25;
  const delayMs = 120;
  while (
    (current.status === "in_progress" || current.status === "incomplete") &&
    n < max
  ) {
    await new Promise((r) => setTimeout(r, delayMs));
    current = (await ai.interactions.get(current.id, {})) as InteractionState;
    n += 1;
  }
  return current;
}

export type MediaInput =
  | {
      kind: "image";
      mimeType: string;
      base64: string;
    }
  | {
      kind: "video";
      mimeType: string;
      base64: string;
    };

/**
 * WhatsApp/Wassist exposes video as a hosted HTTPS URL — we pass that in text instead of
 * embedding bytes in the model (avoids size limits and download failures).
 */
function combineUserTextWithVideoUrl(userText: string, videoReferenceUrl?: string): string {
  if (!videoReferenceUrl?.trim()) return userText;
  const caption = userText.trim() || "(Video message, no caption.)";
  return [
    caption,
    "",
    `[User attached a video. The clip is available at this URL — use it as the reference for coaching (do not claim you downloaded or watched the binary): ${videoReferenceUrl.trim()}]`,
  ].join("\n");
}

export async function runLobSmashCoach(params: {
  ctx: CoachContext & { duoId?: string };
  userText: string;
  media?: MediaInput;
  /** Hosted video URL from Wassist — injected into the text prompt; not sent as inline video bytes. */
  videoReferenceUrl?: string;
}): Promise<string> {
  try {
    return await runLobSmashCoachInner(params);
  } catch (e) {
    console.error("lobsmash: Interactions API failed, trying generateContent fallback", e);
    try {
      return await runCoachGenerateContentFallback(params);
    } catch (e2) {
      console.error("lobsmash: generateContent fallback failed", e2);
      return "Coach couldn’t reach the AI just now. Try again in a moment.";
    }
  }
}

/** Last-resort path when `interactions.*` throws (no tools / no server-side chain). */
async function runCoachGenerateContentFallback(params: {
  ctx: CoachContext & { duoId?: string };
  userText: string;
  media?: MediaInput;
  videoReferenceUrl?: string;
}): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return "Coach is misconfigured: set GEMINI_API_KEY in the server environment.";
  }

  const ai = new GoogleGenAI({ apiKey });
  const player = await q.getPlayer(params.ctx.waId);
  const onboardingIntro = shouldGiveOnboardingIntro(
    player,
    params.userText,
    Boolean(params.media || params.videoReferenceUrl),
  );
  const systemInstruction = buildSystemInstruction(params.ctx.coachMode, { onboardingIntro });
  const preamble = params.ctx.memoryBlock ? `${params.ctx.memoryBlock}\n\n---\n` : "";
  const fullUserText = combineUserTextWithVideoUrl(params.userText, params.videoReferenceUrl);
  const fullText = `${preamble}User message:\n${fullUserText}`;

  const parts: Part[] = [{ text: fullText }];
  if (params.media?.kind === "image") {
    parts.push({
      inlineData: {
        mimeType: params.media.mimeType,
        data: params.media.base64,
      },
    });
  } else if (params.media?.kind === "video" && !params.videoReferenceUrl) {
    parts.push({
      inlineData: {
        mimeType: params.media.mimeType,
        data: params.media.base64,
      },
    });
  }

  const contents = createUserContent(parts);
  let lastErr: unknown;

  for (const model of GENERATE_FALLBACK_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction,
          temperature: 0.7,
          maxOutputTokens: 8192,
        },
      });
      const text = response.text?.trim();
      if (text) return text;
    } catch (err) {
      lastErr = err;
      console.warn("lobsmash: generateContent failed for model", model, err);
    }
  }

  throw lastErr ?? new Error("generateContent returned no text");
}

async function runLobSmashCoachInner(params: {
  ctx: CoachContext & { duoId?: string };
  userText: string;
  media?: MediaInput;
  videoReferenceUrl?: string;
}): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return "Coach is misconfigured: set GEMINI_API_KEY in the server environment.";
  }

  const ai = new GoogleGenAI({ apiKey });
  const player = await q.getPlayer(params.ctx.waId);
  const onboardingIntro = shouldGiveOnboardingIntro(
    player,
    params.userText,
    Boolean(params.media || params.videoReferenceUrl),
  );
  const systemInstruction = buildSystemInstruction(params.ctx.coachMode, { onboardingIntro });
  const preamble = params.ctx.memoryBlock ? `${params.ctx.memoryBlock}\n\n---\n` : "";
  const fullUserText = combineUserTextWithVideoUrl(params.userText, params.videoReferenceUrl);
  const fullText = `${preamble}User message:\n${fullUserText}`;

  const inputParts: ContentPart[] = [{ type: "text", text: fullText }];
  if (params.media?.kind === "image") {
    inputParts.push({
      type: "image",
      data: params.media.base64,
      mime_type: normalizeImageMime(params.media.mimeType),
    });
  } else if (params.media?.kind === "video" && !params.videoReferenceUrl) {
    inputParts.push({
      type: "video",
      data: params.media.base64,
      mime_type: normalizeVideoMime(params.media.mimeType),
    });
  }
  const keyFp = q.fingerprintGeminiApiKey(apiKey);
  let previousInteractionId = player?.lastInteractionId ?? undefined;

  const disableChain =
    process.env.GEMINI_DISABLE_INTERACTION_CHAIN === "1" ||
    process.env.GEMINI_DISABLE_INTERACTION_CHAIN === "true";

  if (disableChain) {
    previousInteractionId = undefined;
  } else if (player?.lastInteractionId) {
    const fpMismatch =
      player.geminiKeyFp != null && player.geminiKeyFp !== keyFp;
    const unboundChain = player.geminiKeyFp == null;
    if (fpMismatch || unboundChain) {
      console.warn(
        "lobsmash: clearing Gemini interaction chain (new key fingerprint or first bind)",
        { fpMismatch, unboundChain },
      );
      await q.clearLastInteractionId(params.ctx.waId);
      previousInteractionId = undefined;
    }
  }

  await q.upsertPlayer(params.ctx.waId, { geminiKeyFp: keyFp });

  async function createInteraction(model: string, input: ContentPart[], prevId: string | undefined) {
    return (await ai.interactions.create({
      model,
      system_instruction: systemInstruction,
      tools: LOBSMASH_TOOLS,
      input,
      previous_interaction_id: prevId,
      store: true,
      generation_config: { temperature: 0.7 },
    })) as InteractionState;
  }

  /**
   * Stale `previous_interaction_id` (wrong API key, expired store, or DB reset) makes create() throw.
   * Clear the stored id and retry once without chaining.
   */
  async function createInteractionOrRecover(model: string, input: ContentPart[], prevId: string | undefined) {
    try {
      return await createInteraction(model, input, prevId);
    } catch (e) {
      if (!prevId) throw e;
      console.warn(
        "lobsmash: interaction create failed; clearing lastInteractionId and retrying",
        e,
      );
      await q.clearLastInteractionId(params.ctx.waId);
      previousInteractionId = undefined;
      return await createInteraction(model, input, undefined);
    }
  }

  let modelUsed = MODEL_PRIMARY;
  let interaction: InteractionState;
  try {
    interaction = await createInteractionOrRecover(modelUsed, inputParts, previousInteractionId);
  } catch (e) {
    console.warn("lobsmash: primary model failed, trying fallback", e);
    modelUsed = MODEL_FALLBACK;
    interaction = await createInteractionOrRecover(modelUsed, inputParts, undefined);
  }

  interaction = await waitUntilInteractionReady(ai, interaction);

  if (interaction.status === "failed") {
    return "Coach hit an error generating a reply. Try again with a shorter message.";
  }

  let rounds = 0;
  while (interaction.status === "requires_action" && rounds < 14) {
    rounds += 1;
    const calls = getFunctionCalls(interaction.outputs as unknown[]);
    const results: FunctionResultContent[] = [];
    for (const call of calls) {
      let text: string;
      try {
        text = await executeToolCall(call.name, call.arguments, params.ctx);
      } catch (toolErr) {
        console.error("lobsmash: tool execution failed", call.name, toolErr);
        text = "Tool error — continue without saving.";
      }
      results.push({
        type: "function_result",
        call_id: call.id,
        name: call.name,
        result: { output: text },
      });
    }
    if (!results.length) break;

    interaction = (await ai.interactions.create({
      model: modelUsed,
      system_instruction: systemInstruction,
      tools: LOBSMASH_TOOLS,
      input: results,
      previous_interaction_id: interaction.id,
      store: true,
      generation_config: { temperature: 0.7 },
    })) as InteractionState;

    interaction = await waitUntilInteractionReady(ai, interaction);
  }

  const reply = extractTextFromOutputs(interaction.outputs as unknown[]);
  if (interaction.id) {
    await q.upsertPlayer(params.ctx.waId, { lastInteractionId: interaction.id });
  }

  return reply || "I’m here — send that again in one short message?";
}

function normalizeImageMime(m: string): ImageContent["mime_type"] {
  if (m === "image/png" || m === "image/webp" || m === "image/heic" || m === "image/heif") return m;
  return "image/jpeg";
}

function normalizeVideoMime(m: string): VideoContent["mime_type"] {
  const allowed: VideoContent["mime_type"][] = [
    "video/mp4",
    "video/mpeg",
    "video/mov",
    "video/avi",
    "video/webm",
    "video/3gpp",
  ];
  return (allowed.includes(m as VideoContent["mime_type"]) ? m : "video/mp4") as VideoContent["mime_type"];
}
