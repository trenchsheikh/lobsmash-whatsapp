export type WebhookReplyResult =
  | { kind: "wassist_json"; body: Record<string, unknown> }
  | { kind: "text"; text: string };

/**
 * Pro marketing when the user *asks* about uploading/sending video (no attachment yet).
 * Actual video messages are handled by passing the hosted URL in the coach prompt — not here.
 *
 * **Wassist WhatsApp template** (recommended): create & publish a template in Wassist/Meta,
 * set `LOBSMASH_VIDEO_PRO_TEMPLATE_NAME`, and optional `LOBSMASH_VIDEO_PRO_TEMPLATE_VARIABLES_JSON`.
 * Shape matches [Send Message](https://docs.wassist.app/api-reference/conversations/messages/send)
 * (`type: "template"`, `template.name`, `template.variables`).
 *
 * **Fallback**: plain session message `{ type: "message", content }` (BYOA example) when no template name.
 */

const DEFAULT_PRO_URL = "https://lobsmash.com";

export function getProUpgradeUrl(): string {
  return process.env.LOBSMASH_PRO_URL?.trim() || DEFAULT_PRO_URL;
}

/** User is asking about sending/uploading video for coaching (not generic “video” mentions). */
export function wantsVideoUploadHelp(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;

  if (
    /\b(upload|send|attach|share)\s+(a\s+)?video\b/.test(t) ||
    /\b(can|could)\s+i\s+(upload|send|attach|share)\s+(a\s+)?video\b/.test(t) ||
    /\bhow\s+(do|can)\s+i\s+(upload|send|attach|share)\s+(a\s+)?video\b/.test(t) ||
    /\bvideo\s+(upload|analysis|review|feedback|coaching|coach)\b/.test(t) ||
    /\b(analyze|review|coach)\s+(my\s+)?\b(video|clip|footage)\b/.test(t) ||
    /\b(send|upload)\s+(you\s+)?(a\s+)?(clip|footage|recording)\b/.test(t)
  ) {
    return true;
  }

  return false;
}

/** Plain-text fallback when no HSM template name is configured. */
export function getVideoProUpgradeTemplate(): string {
  const url = getProUpgradeUrl();
  return [
    "🎾 *Video coaching — Pro only*",
    "",
    "Full match & swing video analysis is part of LobSmash Pro.",
    "",
    `Upgrade: ${url}`,
    "",
    "Unlock deeper breakdowns and priority feedback from your coach.",
  ].join("\n");
}

type TemplateVariables = {
  body?: string[];
  header?: string;
  buttons?: string[];
};

function parseTemplateVariablesFromEnv(): TemplateVariables | undefined {
  const raw = process.env.LOBSMASH_VIDEO_PRO_TEMPLATE_VARIABLES_JSON?.trim();
  if (!raw) return undefined;
  try {
    const v = JSON.parse(raw) as unknown;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return v as TemplateVariables;
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

/**
 * Webhook JSON for Wassist BYOA — mirrors Send Message `type: "template"` payload.
 * @see https://docs.wassist.app/api-reference/conversations/messages/send
 */
export function getVideoProUpgradeWassistResponse(): Record<string, unknown> {
  const templateName = process.env.LOBSMASH_VIDEO_PRO_TEMPLATE_NAME?.trim();
  if (!templateName) {
    return {
      type: "message",
      content: getVideoProUpgradeTemplate(),
    };
  }

  const parsed = parseTemplateVariablesFromEnv();
  const url = getProUpgradeUrl();
  const variables: TemplateVariables = parsed ?? {
    /** Default: one body placeholder — match your template’s {{1}} (or equivalent). */
    body: [url],
  };

  return {
    type: "template",
    template: {
      name: templateName,
      variables,
    },
  };
}
