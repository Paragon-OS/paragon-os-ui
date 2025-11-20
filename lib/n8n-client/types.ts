/**
 * n8n Client Types
 * Type definitions for n8n workflow calls and responses
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
  executionId?: string; // Execution ID when available
  workflowId?: string; // Workflow ID extracted from webhook URL
}

/**
 * n8n Execution API response types
 */
export interface N8nExecution {
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

export interface N8nExecutionResponse {
  data?: N8nExecution[];
}

