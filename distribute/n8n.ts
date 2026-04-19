/**
 * n8n Webhook Integration — distributes published episodes to social channels
 *
 * Sends episode content to n8n webhook endpoints for:
 * - Blog post (GitHub Pages push)
 * - Social clips (Twitter/X, LinkedIn)
 * - Newsletter (email)
 *
 * n8n handles the actual posting — this module just delivers the payload.
 */

const N8N_BASE_URL =
  process.env.N8N_URL || "http://localhost:5678";

export interface DistributePayload {
  episodeId: string;
  slug: string;
  title: string;
  episodeNumber: number;
  blog: string | null;
  socialClips: SocialClip[];
  audioScript: string | null;
  sources: { url: string; title: string; author: string }[];
  publishedAt: string;
}

interface SocialClip {
  text: string;
  platform?: string;
  source?: string;
}

export interface DistributeResult {
  channel: string;
  success: boolean;
  response?: string;
  error?: string;
}

/**
 * Distribute an episode to all configured n8n webhook channels
 */
export async function distribute(
  payload: DistributePayload,
  channels?: string[]
): Promise<DistributeResult[]> {
  const allChannels = channels || ["blog", "social", "newsletter"];
  const results: DistributeResult[] = [];

  for (const channel of allChannels) {
    const webhookPath = `/webhook/listening-station/${channel}`;
    const result = await sendToWebhook(webhookPath, channel, payload);
    results.push(result);
  }

  return results;
}

/**
 * Send payload to a specific n8n webhook
 */
async function sendToWebhook(
  path: string,
  channel: string,
  payload: DistributePayload
): Promise<DistributeResult> {
  try {
    const response = await fetch(`${N8N_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel,
        ...payload,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return {
        channel,
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const data = await response.text();
    return { channel, success: true, response: data };
  } catch (err) {
    return {
      channel,
      success: false,
      error:
        err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Check if n8n is available
 */
export async function isN8nAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${N8N_BASE_URL}/healthz`, {
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
