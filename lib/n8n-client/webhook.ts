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

// Constants
const EXECUTION_LOOKUP_BUFFER_MS = 10000; // 10 seconds buffer for timing issues
const MAX_WORKFLOW_ID_ATTEMPTS = 5;
const MAX_TIME_BASED_ATTEMPTS = 3;
const SYNC_RESPONSE_THRESHOLD_MS = 5000; // Consider response sync if it took > 5s

// Simple logger utility
const logger = {
  info: (message: string, ...args: unknown[]) => {
    console.log(`[n8n-webhook] ${message}`, ...args);
  },
  error: (message: string, error?: unknown) => {
    console.error(`[n8n-webhook] ${message}`, error);
  },
};

/**
 * Attempt to find execution ID via API lookup
 */
async function findExecutionViaApi(
  workflowId: string | null,
  startTime: number,
): Promise<string | null> {
  const hasApiKey = !!process.env.N8N_API_KEY;
  logger.info(`API key configured: ${hasApiKey}`);

  if (!hasApiKey) {
    logger.info("Skipping API lookup - no API key configured");
    logger.info("To track executions, either:");
    logger.info("  1. Set N8N_API_KEY in .env.local");
    logger.info("  2. Configure webhook to 'Wait for Webhook Response' mode in n8n");
    if (workflowId) {
      logger.info(`  3. Use workflow ID: ${workflowId}`);
    }
    return null;
  }

  logger.info("Attempting to find execution via API lookup");

  if (workflowId) {
    // Try multiple times with increasing delays
    for (let attempt = 0; attempt < MAX_WORKFLOW_ID_ATTEMPTS; attempt++) {
      logger.info(`Attempt ${attempt + 1} to find execution by workflow ID`);
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));

      const executionId = await findLatestExecution(
        workflowId,
        new Date(startTime - EXECUTION_LOOKUP_BUFFER_MS),
      );

      if (executionId) {
        logger.info(`Found execution ID: ${executionId}`);
        return executionId;
      }
    }
  } else {
    // Fallback: try to find any recent execution by time
    logger.info("No workflow ID, trying to find by time");
    for (let attempt = 0; attempt < MAX_TIME_BASED_ATTEMPTS; attempt++) {
      logger.info(`Attempt ${attempt + 1} to find execution by time`);
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));

      const executionId = await findLatestExecutionByTime(
        new Date(startTime - EXECUTION_LOOKUP_BUFFER_MS),
      );

      if (executionId) {
        logger.info(`Found execution ID: ${executionId}`);
        return executionId;
      }
    }
  }

  return null;
}

/**
 * Handle async response when execution ID could not be found
 */
function handleAsyncResponseWithoutExecution(
  data: unknown,
  workflowId: string | null,
  webhookResponseTime: number,
): N8nWorkflowResponse {
  logger.info("Could not find execution ID");
  logger.info(`Webhook response time was: ${webhookResponseTime}ms`);

  const hasApiKey = !!process.env.N8N_API_KEY;

  // If the webhook took a long time to respond, it might have completed synchronously
  const dataObj = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  const looksLikeResult =
    dataObj &&
    !dataObj.message?.toString().includes("Workflow was started") &&
    Object.keys(dataObj).length > 1;

  if (looksLikeResult || webhookResponseTime > SYNC_RESPONSE_THRESHOLD_MS) {
    logger.info("Response appears to be synchronous completion, returning data");
    return {
      success: true,
      data,
      ...(workflowId && { workflowId }),
    };
  }

  // Could not find execution ID, return the async response with helpful info
  const note = hasApiKey
    ? "Workflow started asynchronously. Execution ID could not be determined."
    : "Workflow started asynchronously. Execution ID not available (set N8N_API_KEY to track executions).";

  return {
    success: true,
    data: {
      ...dataObj,
      note,
    },
    ...(workflowId && { workflowId }),
  };
}

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

    logger.info(`Calling webhook: ${webhookUrl}, method: ${method}`);
    const webhookStartTime = Date.now();
    const response = await fetch(webhookUrl, options);
    const webhookResponseTime = Date.now() - webhookStartTime;
    logger.info(`Webhook response received after: ${webhookResponseTime}ms`);
    clearTimeout(timeoutId);

    if (!response.ok) {
      logger.info(`Webhook response not OK: ${response.status} ${response.statusText}`);
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

    logger.info(`Should wait for completion: ${shouldWait}`);
    logger.info(`Is async response: ${isAsyncResponse(data)}`);

    if (shouldWait && isAsyncResponse(data)) {
      // Try to extract execution ID from multiple sources
      const executionIdFromData = extractExecutionId(data);
      let executionId = executionIdHeader || executionIdFromData;

      logger.info(`Execution ID from header: ${executionIdHeader}`);
      logger.info(`Execution ID from data: ${executionIdFromData}`);
      logger.info(`Initial execution ID: ${executionId}`);

      // If no execution ID in response, try to find it by workflow ID (requires API key)
      if (!executionId) {
        logger.info("No execution ID found in response");
        const workflowId = extractWorkflowIdFromUrl(webhookUrl);
        logger.info(`Extracted workflow ID from URL: ${workflowId}`);

        executionId = await findExecutionViaApi(workflowId, startTime);
      }

      if (executionId) {
        logger.info(`Found execution ID, polling for completion: ${executionId}`);
        const remainingTimeout = timeout - (Date.now() - startTime);
        logger.info(`Remaining timeout: ${remainingTimeout}ms`);

        if (remainingTimeout > 0) {
          return await pollExecutionStatus(executionId, remainingTimeout, startTime);
        }

        logger.info("Insufficient time remaining");
        return {
          success: false,
          error: "Insufficient time remaining to wait for workflow completion",
          executionId,
        };
      }

      // Could not find execution ID
      const workflowId = extractWorkflowIdFromUrl(webhookUrl);
      return handleAsyncResponseWithoutExecution(data, workflowId, webhookResponseTime);
    }

    // Synchronous response or waiting disabled
    // Include execution ID if available from headers or response data
    const executionIdFromData = extractExecutionId(data);
    const finalExecutionId = executionIdHeader || executionIdFromData;
    logger.info(`Synchronous response - final execution ID: ${finalExecutionId}`);

    return {
      success: true,
      data,
      ...(finalExecutionId && { executionId: finalExecutionId }),
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

