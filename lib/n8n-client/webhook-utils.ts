/**
 * n8n Webhook Utilities
 * Helper functions for parsing webhook responses and URLs
 */

/**
 * Extract execution ID from webhook response
 * n8n may return execution ID in different formats
 */
export function extractExecutionId(responseData: unknown): string | null {
  if (!responseData || typeof responseData !== "object") {
    return null;
  }

  const data = responseData as Record<string, unknown>;

  // Check for direct executionId field
  if (typeof data.executionId === "string") {
    return data.executionId;
  }

  // Check for id field
  if (typeof data.id === "string") {
    return data.id;
  }

  // Check nested in data object
  if (data.data && typeof data.data === "object") {
    const nestedData = data.data as Record<string, unknown>;
    if (typeof nestedData.executionId === "string") {
      return nestedData.executionId;
    }
    if (typeof nestedData.id === "string") {
      return nestedData.id;
    }
  }

  return null;
}

/**
 * Check if webhook response indicates async execution
 */
export function isAsyncResponse(responseData: unknown): boolean {
  if (!responseData || typeof responseData !== "object") {
    return false;
  }

  const data = responseData as Record<string, unknown>;

  // Check for "Workflow was started" message
  if (
    typeof data.message === "string" &&
    data.message.toLowerCase().includes("workflow was started")
  ) {
    return true;
  }

  // Check if execution ID is present (indicates async)
  if (extractExecutionId(responseData)) {
    return true;
  }

  // Check for async indicators
  if (data.async === true || data.mode === "async") {
    return true;
  }

  return false;
}

/**
 * Extract workflow ID from webhook URL if possible
 * n8n webhook URLs often contain the workflow ID
 */
export function extractWorkflowIdFromUrl(webhookUrl: string): string | null {
  // Try to match UUID pattern in URL
  // n8n webhook URLs are typically: /webhook/{workflowId} or /webhook/{path}
  const uuidPattern =
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  const match = webhookUrl.match(uuidPattern);
  return match ? match[0] : null;
}

