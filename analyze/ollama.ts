/**
 * Ollama integration for local LLM processing
 * Uses Qwen 2.5-coder:32b for briefing generation and technique extraction
 */

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || "qwen2.5-coder:32b";

export interface OllamaResponse {
  model: string;
  response: string;
  done: boolean;
  total_duration?: number;
}

/**
 * Generate a completion from Ollama
 */
export async function generate(
  prompt: string,
  options?: {
    model?: string;
    system?: string;
    temperature?: number;
  }
): Promise<string> {
  const model = options?.model || DEFAULT_MODEL;

  const response = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      system: options?.system,
      stream: false,
      options: {
        temperature: options?.temperature ?? 0.7,
        num_ctx: 16384,
      },
    }),
    signal: AbortSignal.timeout(300000), // 5 min timeout for long generations
  });

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.statusText}`);
  }

  const data = (await response.json()) as OllamaResponse;
  return data.response;
}

/**
 * Check if Ollama is available
 */
export async function isAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Generate embeddings for semantic search
 */
export async function embed(
  text: string,
  model = "nomic-embed-text"
): Promise<number[]> {
  const response = await fetch(`${OLLAMA_URL}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, input: text }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`Ollama embed error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.embeddings?.[0] || [];
}
