/**
 * n8n Client Library
 * Main entry point for calling n8n workflows via webhooks or local API
 */

import type { N8nWorkflowCallOptions, N8nWorkflowResponse } from "./types";
import { DEFAULT_TIMEOUT } from "./config";
import { callWebhook } from "./webhook";
import { callLocalApi } from "./api";
import { getWebhookBaseUrl, getN8nBaseUrl } from "./config";

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
    waitForCompletion,
  } = options;

  // Prefer webhook URL if provided
  if (webhookUrl) {
    return callWebhook(webhookUrl, method, payload, timeout, waitForCompletion);
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

// Re-export types for convenience
export type { N8nWorkflowCallOptions, N8nWorkflowResponse } from "./types";

