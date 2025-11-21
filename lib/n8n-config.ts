/**
 * n8n Workflow Configuration
 * Maps workflow names to webhook URLs and defines confirmation requirements
 */

import { buildWebhookUrl } from "./n8n-client";

export interface WorkflowConfig {
  webhookPath?: string;
  webhookUrl?: string;
  workflowId?: string;
  requiresConfirmation: boolean;
  description: string;
  method?: "GET" | "POST";
}

export type WorkflowName =
  | "answerQuestion"
  | "sendMessage"
  | "generateTriage"
  | "callN8nWorkflow";

/**
 * Workflow configurations
 * Add your n8n workflow webhook paths or URLs here
 */
export const workflowConfigs: Record<WorkflowName, WorkflowConfig> = {
  answerQuestion: {
    // Update this with your actual webhook path for the Q&A workflow
    webhookPath: "/answer-question",
    requiresConfirmation: false,
    description: "Answer a question using personal Telegram & Discord chat history",
    method: "POST",
  },
  sendMessage: {
    // Update this with your actual webhook path for sending messages
    webhookPath: "/send-message",
    requiresConfirmation: true,
    description: "Send a message via Telegram or Discord using the paragonos-send-message webhook. Use this tool when the user wants to send a message, call a POST webhook with a message, or send a message to someone. This tool automatically calls the correct webhook URL (http://localhost:5678/webhook-test/paragonos-send-message or http://localhost:5678/webhook/paragonos-send-message) with the properly formatted payload. Accepts an optional 'message' parameter - if provided, sends that specific message; otherwise uses the conversation history.",
    method: "POST",
  },
  generateTriage: {
    // Update this with your actual webhook path for generating triages
    webhookPath: "/generate-triage",
    requiresConfirmation: false,
    description: "Generate a triage from context",
    method: "POST",
  },
  callN8nWorkflow: {
    // Generic workflow caller - uses provided webhook URL directly
    requiresConfirmation: false,
    description: "Call any n8n workflow via webhook URL",
    method: "POST",
  },
};

/**
 * Get workflow configuration by name
 */
export function getWorkflowConfig(
  workflowName: WorkflowName,
): WorkflowConfig | null {
  return workflowConfigs[workflowName] || null;
}

/**
 * Get webhook URL for a workflow
 */
export function getWorkflowWebhookUrl(workflowName: WorkflowName): string | null {
  const config = getWorkflowConfig(workflowName);
  if (!config) return null;

  if (config.webhookUrl) {
    return config.webhookUrl;
  }

  if (config.webhookPath) {
    return buildWebhookUrl(config.webhookPath);
  }

  return null;
}

/**
 * Check if a workflow requires confirmation
 */
export function requiresConfirmation(workflowName: WorkflowName): boolean {
  const config = getWorkflowConfig(workflowName);
  return config?.requiresConfirmation ?? false;
}

/**
 * Get workflow description
 */
export function getWorkflowDescription(workflowName: WorkflowName): string {
  const config = getWorkflowConfig(workflowName);
  return config?.description ?? "Unknown workflow";
}

/**
 * Get paragonos-send-message webhook URL
 * Supports both test and production endpoints
 * Tries test endpoint first, falls back to production
 */
export function getParagonosSendMessageWebhookUrl(useTest: boolean = true): string {
  const baseUrl = process.env.N8N_BASE_URL || "http://localhost:5678";
  const endpoint = useTest ? "/webhook-test/paragonos-send-message" : "/webhook/paragonos-send-message";
  return `${baseUrl}${endpoint}`;
}
