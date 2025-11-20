/**
 * n8n Execution Management
 * Handles execution polling, status checking, and result extraction
 */

import type { N8nExecution, N8nExecutionResponse, N8nWorkflowResponse } from "./types";
import { getN8nBaseUrl, getPollInterval, getApiKey } from "./config";

/**
 * Get execution details from n8n API
 */
export async function getExecution(
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
    const apiKey = getApiKey();
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
export async function findLatestExecution(
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
      const apiKey = getApiKey();
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
 * Find latest execution by time only (fallback when workflow ID is unknown)
 */
export async function findLatestExecutionByTime(
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
    const apiKey = getApiKey();
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
 * Extract workflow result from completed execution
 */
export function extractWorkflowResult(execution: N8nExecution): unknown {
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
export async function pollExecutionStatus(
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

