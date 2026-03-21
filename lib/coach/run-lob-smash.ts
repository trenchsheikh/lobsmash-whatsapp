import { GoogleGenAI } from "@google/genai";
import { buildSystemInstruction } from "../lobsmash-system-prompt";
import { LOBSMASH_TOOLS, executeToolCall } from "./tools";
import type { CoachContext } from "./types";
import * as q from "../db/queries";

const MODEL = "gemini-3-flash-preview";

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
  result: string;
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
  const previousInteractionId = player?.lastInteractionId ?? undefined;

  let interaction = await ai.interactions.create({
    model: MODEL,
    system_instruction: systemInstruction,
    tools: LOBSMASH_TOOLS,
    input: inputParts,
    previous_interaction_id: previousInteractionId,
    store: true,
    generation_config: { temperature: 0.7 },
  });

  if (interaction.status === "failed") {
    return "Coach hit an error generating a reply. Try again with a shorter message.";
  }

  let rounds = 0;
  while (interaction.status === "requires_action" && rounds < 14) {
    rounds += 1;
    const calls = getFunctionCalls(interaction.outputs as unknown[]);
    const results: FunctionResultContent[] = [];
    for (const call of calls) {
      const text = await executeToolCall(call.name, call.arguments, params.ctx);
      results.push({
        type: "function_result",
        call_id: call.id,
        name: call.name,
        result: text,
      });
    }
    if (!results.length) break;

    interaction = await ai.interactions.create({
      model: MODEL,
      system_instruction: systemInstruction,
      tools: LOBSMASH_TOOLS,
      input: results,
      previous_interaction_id: interaction.id,
      store: true,
      generation_config: { temperature: 0.7 },
    });
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
