// Thin wrapper around the Claude API for the optional AI drafter and audit (spec 12.1 step 5, 14.4).
// One structured-output request per call; the caller supplies the JSON schema and parses the result.
//
// Model: env ANTHROPIC_MODEL, else DEFAULT_MODEL. Key: env ANTHROPIC_API_KEY (read by the SDK).
// Tests inject a fake AiClient, so nothing here touches the network unless anthropicClient() is used.

import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessage, MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/beta/messages/messages";

export const DEFAULT_MODEL = "claude-opus-5-5";

/** Models that accept the server-side refusal fallback (`fallbacks: "default"`). */
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-fable-5-2", "claude-fable-5-1", "claude-sonnet-5-5"]);
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export function modelFromEnv(env: Record<string, string | undefined> = process.env): string {
  return env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
}

/** The one SDK call we make. Tests pass a fake with the same shape. */
export interface AiClient {
  create(params: MessageCreateParamsNonStreaming): Promise<BetaMessage>;
}

export function anthropicClient(): AiClient {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment
  return { create: (params) => client.beta.messages.create(params) };
}

export interface JsonRequest {
  model: string;
  system: string;
  user: string;
  /** JSON schema for structured output (objects need additionalProperties: false and required). */
  schema: Record<string, unknown>;
  maxTokens?: number;
}

export function buildParams(req: JsonRequest): MessageCreateParamsNonStreaming {
  const params: MessageCreateParamsNonStreaming = {
    model: req.model,
    max_tokens: req.maxTokens ?? 16000,
    system: req.system,
    messages: [{ role: "user", content: req.user }],
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: { type: "json_schema", schema: req.schema } },
  };
  if (FALLBACK_MODELS.has(req.model)) {
    // If a safety classifier declines, the API retries the same request on a fallback model.
    params.betas = [FALLBACK_BETA];
    params.fallbacks = "default";
  }
  return params;
}

export class AiResponseError extends Error {}

/** Sends one request and returns the parsed JSON object plus the model that served it. */
export async function requestJson<T>(client: AiClient, req: JsonRequest): Promise<{ data: T; model: string }> {
  const res = await client.create(buildParams(req));
  if (res.stop_reason === "refusal") {
    const d = res.stop_details;
    throw new AiResponseError(`The model declined the request${d?.category ? ` (${d.category})` : ""}.`);
  }
  if (res.stop_reason === "max_tokens") throw new AiResponseError("The response hit max_tokens before finishing.");
  const text = res.content
    .filter((b): b is Extract<BetaMessage["content"][number], { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("");
  try {
    return { data: JSON.parse(text) as T, model: res.model };
  } catch {
    throw new AiResponseError(`The response was not valid JSON: ${text.slice(0, 200)}`);
  }
}

/** One-line description of an API failure for logs (typed SDK errors, most specific first). */
export function describeApiError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "Authentication failed: check the ANTHROPIC_API_KEY secret.";
  if (err instanceof Anthropic.RateLimitError) return "Rate limited by the Claude API; re-run later.";
  if (err instanceof Anthropic.BadRequestError) return `Bad request: ${err.message} (check ANTHROPIC_MODEL).`;
  if (err instanceof Anthropic.APIError) return `Claude API error ${err.status ?? ""}: ${err.message}`;
  if (err instanceof AiResponseError) return err.message;
  return err instanceof Error ? err.message : String(err);
}
