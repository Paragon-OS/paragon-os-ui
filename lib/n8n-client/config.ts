/**
 * n8n Client Configuration
 * Handles environment variable configuration
 */

export const DEFAULT_TIMEOUT = 60000; // 60 seconds (increased for long-running workflows)
export const DEFAULT_POLL_INTERVAL = 500; // 500ms between polls
const DEFAULT_N8N_BASE_URL = "http://localhost:5678";
const DEFAULT_STREAMING_CONNECTION_TYPE = "sse";

/**
 * Get the n8n base URL from environment variables
 */
export function getN8nBaseUrl(): string {
  return process.env.N8N_BASE_URL || DEFAULT_N8N_BASE_URL;
}

/**
 * Get the webhook base URL from environment variables
 */
export function getWebhookBaseUrl(): string | null {
  return process.env.N8N_WEBHOOK_BASE_URL || null;
}

/**
 * Get polling interval from environment variables
 */
export function getPollInterval(): number {
  const interval = process.env.N8N_POLL_INTERVAL;
  return interval ? parseInt(interval, 10) : DEFAULT_POLL_INTERVAL;
}

/**
 * Check if we should wait for workflow completion
 */
export function shouldWaitForCompletion(): boolean {
  const wait = process.env.N8N_WAIT_FOR_COMPLETION;
  return wait === undefined || wait === "true" || wait === "1";
}

/**
 * Get n8n API key from environment variables
 */
export function getApiKey(): string | undefined {
  return process.env.N8N_API_KEY;
}

/**
 * Get streaming server URL from environment variables
 * Defaults to Next.js API routes (/api/stream)
 */
export function getStreamingServerUrl(): string {
  // If environment variable is set, use it
  if (process.env.N8N_STREAMING_SERVER_URL) {
    return process.env.N8N_STREAMING_SERVER_URL;
  }
  
  // In browser, use relative URL to current origin
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/stream`;
  }
  
  // On server, default to localhost (for SSR)
  return "http://localhost:3000/api/stream";
}

/**
 * Get streaming connection type preference from environment variables
 * Defaults to SSE (Server-Sent Events) which works with Next.js API routes
 */
export function getStreamingConnectionType(): "websocket" | "sse" {
  const type = process.env.N8N_STREAMING_CONNECTION_TYPE;
  return type === "websocket" ? "websocket" : DEFAULT_STREAMING_CONNECTION_TYPE;
}

