/**
 * n8n Client Library
 * Handles calling n8n workflows via webhooks or local API
 */

export interface N8nWorkflowCallOptions {
  webhookUrl?: string;
  workflowId?: string;
  method?: "GET" | "POST";
  payload?: Record<string, unknown>;
  timeout?: number;
}

export interface N8nWorkflowResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

const DEFAULT_TIMEOUT = 30000; // 30 seconds
const DEFAULT_N8N_BASE_URL = "http://localhost:5678";

/**
 * Get the n8n base URL from environment variables
 */
function getN8nBaseUrl(): string {
  return process.env.N8N_BASE_URL || DEFAULT_N8N_BASE_URL;
}

/**
 * Get the webhook base URL from environment variables
 */
function getWebhookBaseUrl(): string | null {
  return process.env.N8N_WEBHOOK_BASE_URL || null;
}

/**
 * Call an n8n workflow via webhook URL
 */
async function callWebhook(
  webhookUrl: string,
  method: "GET" | "POST",
  payload?: Record<string, unknown>,
  timeout: number = DEFAULT_TIMEOUT,
): Promise<N8nWorkflowResponse> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const options: RequestInit = {
      method,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
      },
    };

    if (method === "POST" && payload) {
      options.body = JSON.stringify(payload);
    }

    const response = await fetch(webhookUrl, options);
    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const data = await response.json().catch(() => {
      // Some webhooks might return non-JSON responses
      return { message: "Workflow executed successfully" };
    });

    return {
      success: true,
      data,
    };
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        return {
          success: false,
          error: "Request timeout - workflow took too long to respond",
        };
      }
      return {
        success: false,
        error: error.message,
      };
    }
    return {
      success: false,
      error: "Unknown error occurred",
    };
  }
}

/**
 * Call an n8n workflow via local API
 */
async function callLocalApi(
  workflowId: string,
  method: "GET" | "POST",
  payload?: Record<string, unknown>,
  timeout: number = DEFAULT_TIMEOUT,
): Promise<N8nWorkflowResponse> {
  const baseUrl = getN8nBaseUrl();
  const apiUrl = `${baseUrl}/api/v1/workflows/${workflowId}/execute`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const options: RequestInit = {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        data: payload || {},
      }),
    };

    // Add authentication if available
    const apiKey = process.env.N8N_API_KEY;
    if (apiKey) {
      options.headers = {
        ...options.headers,
        "X-N8N-API-KEY": apiKey,
      };
    }

    const response = await fetch(apiUrl, options);
    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const data = await response.json();

    return {
      success: true,
      data,
    };
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        return {
          success: false,
          error: "Request timeout - workflow took too long to respond",
        };
      }
      return {
        success: false,
        error: error.message,
      };
    }
    return {
      success: false,
      error: "Unknown error occurred",
    };
  }
}

/**
 * Main function to call an n8n workflow
 */
export async function callN8nWorkflow(
  options: N8nWorkflowCallOptions,
): Promise<N8nWorkflowResponse> {
  const {
    webhookUrl,
    workflowId,
    method = "POST",
    payload,
    timeout = DEFAULT_TIMEOUT,
  } = options;

  // Prefer webhook URL if provided
  if (webhookUrl) {
    return callWebhook(webhookUrl, method, payload, timeout);
  }

  // Fall back to local API if workflow ID is provided
  if (workflowId) {
    return callLocalApi(workflowId, method, payload, timeout);
  }

  return {
    success: false,
    error: "Either webhookUrl or workflowId must be provided",
  };
}

/**
 * Build a webhook URL from a webhook path
 */
export function buildWebhookUrl(webhookPath: string): string {
  const webhookBaseUrl = getWebhookBaseUrl();
  if (webhookBaseUrl) {
    return `${webhookBaseUrl}${webhookPath.startsWith("/") ? webhookPath : `/${webhookPath}`}`;
  }
  // Fallback to local n8n webhook URL
  const baseUrl = getN8nBaseUrl();
  return `${baseUrl}/webhook${webhookPath.startsWith("/") ? webhookPath : `/${webhookPath}`}`;
}
