import { GoogleGenAI } from "@google/genai";
import { buildSystemInstruction } from "../lobsmash-system-prompt";
import { LOBSMASH_TOOLS, executeToolCall } from "./tools";
import type { CoachContext } from "./types";
import * as q from "../db/queries";

const MODEL_PRIMARY = "gemini-3-flash-preview";
const MODEL_FALLBACK = "gemini-2.5-flash";

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

/** Interactions may return in_progress / incomplete; poll briefly so we stay under Kapso's ~10s webhook budget. */
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

export async function runLobSmashCoach(params: {
  ctx: CoachContext & { duoId?: string };
  userText: string;
  media?: MediaInput;
}): Promise<string> {
  try {
    return await runLobSmashCoachInner(params);
  } catch (e) {
    console.error("lobsmash: runLobSmashCoach failed", e);
    return "Coach couldn’t reach the AI just now. Try again in a moment.";
  }
}

async function runLobSmashCoachInner(params: {
  ctx: CoachContext & { duoId?: string };
  userText: string;
  media?: MediaInput;
}): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return "Coach is misconfigured: set GEMINI_API_KEY in the server environment.";
  }

  const ai = new GoogleGenAI({ apiKey });
  const systemInstruction = buildSystemInstruction(params.ctx.coachMode);
  const preamble = params.ctx.memoryBlock ? `${params.ctx.memoryBlock}\n\n---\n` : "";
  const fullText = `${preamble}User message:\n${params.userText}`;

  const inputParts: ContentPart[] = [{ type: "text", text: fullText }];
  if (params.media?.kind === "image") {
    inputParts.push({
      type: "image",
      data: params.media.base64,
      mime_type: normalizeImageMime(params.media.mimeType),
    });
  } else if (params.media?.kind === "video") {
    inputParts.push({
      type: "video",
      data: params.media.base64,
      mime_type: normalizeVideoMime(params.media.mimeType),
    });
  }

  const player = await q.getPlayer(params.ctx.waId);
  let previousInteractionId = player?.lastInteractionId ?? undefined;

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
      await q.upsertPlayer(params.ctx.waId, { lastInteractionId: null });
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
