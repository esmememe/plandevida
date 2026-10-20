import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";

let client: Anthropic | null = null;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: env.anthropicApiKey() });
  return client;
}

/**
 * Pide a Claude una respuesta en JSON con un esquema fijo.
 * Usa una herramienta forzada: el modelo solo puede responder llenando el esquema.
 */
export async function generateJson<T>(opts: {
  system: string;
  prompt: string;
  schemaName: string;
  schemaDescription: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
}): Promise<T> {
  const res = await getClient().messages.create({
    model: env.anthropicModel(),
    max_tokens: opts.maxTokens ?? 2048,
    system: opts.system,
    tools: [
      {
        name: opts.schemaName,
        description: opts.schemaDescription,
        input_schema: opts.schema as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: "tool", name: opts.schemaName },
    messages: [{ role: "user", content: opts.prompt }],
  });
  const block = res.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("La IA no devolvió una respuesta estructurada");
  return block.input as T;
}

/** Texto libre (para el resumen matutino). */
export async function generateText(opts: { system: string; prompt: string; maxTokens?: number }) {
  const res = await getClient().messages.create({
    model: env.anthropicModel(),
    max_tokens: opts.maxTokens ?? 1500,
    system: opts.system,
    messages: [{ role: "user", content: opts.prompt }],
  });
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}
