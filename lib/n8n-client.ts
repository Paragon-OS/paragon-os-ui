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
  waitForCompletion?: boolean; // Override default wait behavior
}

export interface N8nWorkflowResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

const DEFAULT_TIMEOUT = 60000; // 60 seconds (increased for long-running workflows)
const DEFAULT_POLL_INTERVAL = 500; // 500ms between polls
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
 * Get polling interval from environment variables
 */
function getPollInterval(): number {
  const interval = process.env.N8N_POLL_INTERVAL;
  return interval ? parseInt(interval, 10) : DEFAULT_POLL_INTERVAL;
}

/**
 * Check if we should wait for workflow completion
 */
function shouldWaitForCompletion(): boolean {
  const wait = process.env.N8N_WAIT_FOR_COMPLETION;
  return wait === undefined || wait === "true" || wait === "1";
}

/**
 * n8n Execution API response types
 */
interface N8nExecution {
  id: string;
  finished: boolean;
  stoppedAt?: string;
  startedAt: string;
  workflowId: string;
  mode: string;
  retryOf?: string;
  retrySuccessId?: string;
  status: "success" | "error" | "waiting" | "running" | "canceled";
  data?: {
    resultData?: {
      runData?: Record<string, unknown[]>;
    };
  };
}

interface N8nExecutionResponse {
  data?: N8nExecution[];
}

/**
 * Extract execution ID from webhook response
 * n8n may return execution ID in different formats
 */
function extractExecutionId(responseData: unknown): string | null {
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
function isAsyncResponse(responseData: unknown): boolean {
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
 * Get execution details from n8n API
 */
async function getExecution(
  executionId: string,
): Promise<N8nExecution | null> {
  const baseUrl = getN8nBaseUrl();
  const apiUrl = `${baseUrl}/api/v1/executions/${executionId}`;

  try {
    const options: RequestInit = {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
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

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as N8nExecution;
    return data;
  } catch {
    return null;
  }
}

/**
 * Find execution by workflow ID and recent timestamp
 * Used as fallback when execution ID is not in webhook response
 */
async function findLatestExecution(
  workflowId: string,
  startedAfter: Date,
): Promise<string | null> {
  const baseUrl = getN8nBaseUrl();
  // Try both with and without workflowId parameter - some n8n versions use different endpoints
  const apiUrls = [
    `${baseUrl}/api/v1/executions?workflowId=${workflowId}&limit=20`,
    `${baseUrl}/api/v1/executions?limit=20`,
  ];

  for (const apiUrl of apiUrls) {
    try {
      const options: RequestInit = {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
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

      if (!response.ok) {
        continue; // Try next URL
      }

      const data = (await response.json()) as N8nExecutionResponse;
      if (!data.data || data.data.length === 0) {
        continue; // Try next URL
      }

      // Filter by workflow ID if not already filtered by API
      let executions = data.data;
      if (!apiUrl.includes("workflowId=")) {
        executions = executions.filter((exec) => exec.workflowId === workflowId);
      }

      // Find the most recent execution that started after our webhook call
      // Sort by startedAt descending to get the most recent first
      const recentExecutions = executions
        .filter((exec) => {
          const startedAt = new Date(exec.startedAt);
          return startedAt >= startedAfter;
        })
        .sort((a, b) => {
          const aTime = new Date(a.startedAt).getTime();
          const bTime = new Date(b.startedAt).getTime();
          return bTime - aTime; // Descending order
        });

      // Prefer unfinished executions, but fall back to finished ones if needed
      const unfinished = recentExecutions.find((exec) => !exec.finished);
      if (unfinished) {
        return unfinished.id;
      }

      // If all are finished, return the most recent one (might have just finished)
      if (recentExecutions.length > 0) {
        return recentExecutions[0].id;
      }
    } catch {
      continue; // Try next URL
    }
  }

  return null;
}

/**
 * Extract workflow result from completed execution
 */
function extractWorkflowResult(execution: N8nExecution): unknown {
  // Try to extract result from the last node's output
  if (execution.data?.resultData?.runData) {
    const runData = execution.data.resultData.runData;
    const nodeIds = Object.keys(runData);
    
    if (nodeIds.length > 0) {
      // Get the last node's output
      const lastNodeId = nodeIds[nodeIds.length - 1];
      const lastNodeData = runData[lastNodeId];
      
      if (Array.isArray(lastNodeData) && lastNodeData.length > 0) {
        const lastExecution = lastNodeData[lastNodeData.length - 1];
        if (lastExecution && typeof lastExecution === "object") {
          const execData = lastExecution as Record<string, unknown>;
          // Return the data from the last node
          return execData.data || execData.output || execData;
        }
      }
    }
  }

  // Fallback: return the execution data itself
  return execution.data || { status: execution.status };
}

/**
 * Poll execution status until completion
 */
async function pollExecutionStatus(
  executionId: string,
  timeout: number,
  startTime: number = Date.now(),
): Promise<N8nWorkflowResponse> {
  const pollInterval = getPollInterval();

  while (Date.now() - startTime < timeout) {
    const execution = await getExecution(executionId);

    if (!execution) {
      // Execution not found, might have been deleted or doesn't exist yet
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
      continue;
    }

    // Check if execution is finished
    if (execution.finished) {
      if (execution.status === "success") {
        const result = extractWorkflowResult(execution);
        return {
          success: true,
          data: result,
        };
      } else if (execution.status === "error") {
        return {
          success: false,
          error: `Workflow execution failed: ${execution.status}`,
        };
      } else if (execution.status === "canceled") {
        return {
          success: false,
          error: "Workflow execution was canceled",
        };
      }
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  return {
    success: false,
    error: "Workflow execution timeout - workflow took too long to complete",
  };
}

/**
 * Find latest execution by time only (fallback when workflow ID is unknown)
 */
async function findLatestExecutionByTime(
  startedAfter: Date,
): Promise<string | null> {
  const baseUrl = getN8nBaseUrl();
  const apiUrl = `${baseUrl}/api/v1/executions?limit=20`;

  try {
    const options: RequestInit = {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
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

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as N8nExecutionResponse;
    if (!data.data || data.data.length === 0) {
      return null;
    }

    // Find the most recent execution that started after our webhook call
    const recentExecutions = data.data
      .filter((exec) => {
        const startedAt = new Date(exec.startedAt);
        return startedAt >= startedAfter;
      })
      .sort((a, b) => {
        const aTime = new Date(a.startedAt).getTime();
        const bTime = new Date(b.startedAt).getTime();
        return bTime - aTime; // Descending order
      });

    // Prefer unfinished executions
    const unfinished = recentExecutions.find((exec) => !exec.finished);
    if (unfinished) {
      return unfinished.id;
    }

    // If all are finished, return the most recent one
    if (recentExecutions.length > 0) {
      return recentExecutions[0].id;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Extract workflow ID from webhook URL if possible
 * n8n webhook URLs often contain the workflow ID
 */
function extractWorkflowIdFromUrl(webhookUrl: string): string | null {
  // Try to match UUID pattern in URL
  // n8n webhook URLs are typically: /webhook/{workflowId} or /webhook/{path}
  const uuidPattern =
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  const match = webhookUrl.match(uuidPattern);
  return match ? match[0] : null;
}

/**
 * Call an n8n workflow via webhook URL
 */
async function callWebhook(
  webhookUrl: string,
  method: "GET" | "POST",
  payload?: Record<string, unknown>,
  timeout: number = DEFAULT_TIMEOUT,
  waitForCompletion?: boolean,
): Promise<N8nWorkflowResponse> {
  const startTime = Date.now();

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

    // Check response headers for execution ID (some n8n versions include it here)
    const executionIdHeader =
      response.headers.get("x-n8n-execution-id") ||
      response.headers.get("execution-id");

    const data = await response.json().catch(() => {
      // Some webhooks might return non-JSON responses
      return { message: "Workflow executed successfully" };
    });

    // Check if we should wait for completion and if response indicates async execution
    const shouldWait =
      waitForCompletion !== undefined
        ? waitForCompletion
        : shouldWaitForCompletion();
    if (shouldWait && isAsyncResponse(data)) {
      // Try to extract execution ID from multiple sources
      let executionId =
        executionIdHeader || extractExecutionId(data);

      // If no execution ID in response, try to find it by workflow ID
      if (!executionId) {
        const workflowId = extractWorkflowIdFromUrl(webhookUrl);
        if (workflowId) {
          // Wait a bit for execution to start, then find it
          // Try multiple times with increasing delays
          for (let attempt = 0; attempt < 5; attempt++) {
            await new Promise((resolve) =>
              setTimeout(resolve, 1000 * (attempt + 1)),
            );
            executionId = await findLatestExecution(
              workflowId,
              new Date(startTime - 10000), // Check 10 seconds before start to catch any timing issues
            );
            if (executionId) break;
          }
        } else {
          // If we can't extract workflow ID, try to find any recent execution
          // This is a fallback for custom webhook paths
          for (let attempt = 0; attempt < 3; attempt++) {
            await new Promise((resolve) =>
              setTimeout(resolve, 1000 * (attempt + 1)),
            );
            executionId = await findLatestExecutionByTime(
              new Date(startTime - 10000),
            );
            if (executionId) break;
          }
        }
      }

      if (executionId) {
        // Poll for completion
        const remainingTimeout = timeout - (Date.now() - startTime);
        if (remainingTimeout > 0) {
          return pollExecutionStatus(executionId, remainingTimeout, startTime);
        } else {
          return {
            success: false,
            error: "Insufficient time remaining to wait for workflow completion",
          };
        }
      } else {
        // Could not find execution ID, return the async response
        return {
          success: true,
          data: {
            ...data,
            note: "Workflow started asynchronously. Execution ID could not be determined.",
          },
        };
      }
    }

    // Synchronous response or waiting disabled
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
