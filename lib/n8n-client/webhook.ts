/**
 * n8n Webhook Client
 * Handles calling n8n workflows via webhooks
 */

import type { N8nWorkflowResponse } from "./types";
import { DEFAULT_TIMEOUT, shouldWaitForCompletion } from "./config";
import {
  extractExecutionId,
  isAsyncResponse,
  extractWorkflowIdFromUrl,
} from "./webhook-utils";
import {
  findLatestExecution,
  findLatestExecutionByTime,
  pollExecutionStatus,
} from "./execution";

/**
 * Call an n8n workflow via webhook URL
 */
export async function callWebhook(
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

