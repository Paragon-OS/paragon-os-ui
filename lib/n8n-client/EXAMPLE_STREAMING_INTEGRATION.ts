/**
 * Example: Integrating Streaming into Existing n8n Tool Calls
 * 
 * This file demonstrates how to add streaming support to your existing
 * n8n workflow tool calls in the chat API route.
 */

import { callN8nWorkflow } from "@/lib/n8n-client";
import type { StreamUpdate } from "@/lib/n8n-client";

/**
 * Example 1: Basic streaming integration for answerQuestion tool
 */
export async function answerQuestionWithStreaming(question: string) {
  // Track updates in an array (in real app, you might stream to client)
  const updates: StreamUpdate[] = [];
  let executionId: string | null = null;
  let workflowId: string | null = null;

  const result = await callN8nWorkflow({
    webhookUrl: "http://localhost:5678/webhook/answer-question",
    method: "POST",
    payload: { question },
    streaming: {
      onStart: (execId, wfId) => {
        executionId = execId;
        workflowId = wfId;
        console.log(`[answerQuestion] Started: ${execId}`);
        // In a real app, you could send this to the client via SSE or WebSocket
      },
      onUpdate: (update) => {
        updates.push(update);
        console.log(`[answerQuestion] Update: ${update.stage} - ${update.message}`);
        // In a real app, stream this update to the client
      },
      onComplete: (finalResult, execId) => {
        console.log(`[answerQuestion] Completed: ${execId}`);
        console.log("Final result:", finalResult);
      },
      onError: (error, execId) => {
        console.error(`[answerQuestion] Error: ${error}`);
        if (execId) {
          console.error(`Execution ID: ${execId}`);
        }
      },
    },
  });

  return {
    success: result.success,
    executionId: result.executionId,
    workflowId: result.workflowId,
    updates,
    data: result.data,
  };
}

/**
 * Example 2: Streaming with progress tracking
 */
export async function sendMessageWithProgress(
  platform: string,
  recipient: string,
  message: string
) {
  let progress = 0;
  let currentStage = "initializing";

  const result = await callN8nWorkflow({
    webhookUrl: "http://localhost:5678/webhook/send-message",
    method: "POST",
    payload: { platform, recipient, message },
    streaming: {
      onStart: (executionId, workflowId) => {
        console.log(`Message sending started: ${executionId}`);
        progress = 10;
        currentStage = "started";
      },
      onUpdate: (update) => {
        // Map stages to progress percentages
        const stageProgress: Record<string, number> = {
          "validating": 20,
          "connecting": 40,
          "sending": 60,
          "confirming": 80,
          "completed": 100,
        };

        progress = stageProgress[update.stage] || progress;
        currentStage = update.stage;

        console.log(`Progress: ${progress}% - ${update.message}`);
      },
      onComplete: (finalResult) => {
        progress = 100;
        currentStage = "completed";
        console.log("Message sent successfully!");
      },
      onError: (error) => {
        currentStage = "error";
        console.error("Failed to send message:", error);
      },
    },
  });

  return {
    success: result.success,
    executionId: result.executionId,
    progress,
    stage: currentStage,
  };
}

/**
 * Example 3: Modified chat route tool with streaming
 * 
 * This shows how to integrate streaming into the existing tool pattern
 * from app/api/chat/route.ts
 */
export function createStreamingAnswerQuestionTool() {
  return {
    description: "Answer questions using personal Telegram & Discord chat history with real-time progress updates",
    parameters: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "The question to answer using personal chat history",
        },
      },
      required: ["question"],
    },
    execute: async ({ question }: { question: string }) => {
      const webhookUrl = "http://localhost:5678/webhook/answer-question";
      
      if (!webhookUrl) {
        return {
          success: false,
          error: "Answer question workflow is not configured",
        };
      }

      // Store updates to return with final result
      const updates: Array<{ stage: string; message: string; timestamp: string }> = [];

      const result = await callN8nWorkflow({
        webhookUrl,
        method: "POST",
        payload: { question },
        streaming: {
          onStart: (executionId, workflowId) => {
            console.log(`[Tool] Workflow started: ${executionId}`);
            updates.push({
              stage: "started",
              message: `Workflow execution started (ID: ${executionId})`,
              timestamp: new Date().toISOString(),
            });
          },
          onUpdate: (update) => {
            console.log(`[Tool] ${update.stage}: ${update.message}`);
            updates.push({
              stage: update.stage,
              message: update.message,
              timestamp: update.timestamp,
            });
          },
          onComplete: (finalResult, executionId) => {
            console.log(`[Tool] Workflow completed: ${executionId}`);
            updates.push({
              stage: "completed",
              message: "Workflow execution completed successfully",
              timestamp: new Date().toISOString(),
            });
          },
          onError: (error, executionId) => {
            console.error(`[Tool] Workflow error: ${error}`);
            updates.push({
              stage: "error",
              message: error,
              timestamp: new Date().toISOString(),
            });
          },
        },
      });

      if (!result.success) {
        return {
          success: false,
          error: result.error || "Failed to execute workflow",
          executionId: result.executionId,
        };
      }

      return {
        success: true,
        answer: result.data,
        executionId: result.executionId,
        workflowId: result.workflowId,
        updates, // Include all updates in the response
      };
    },
  };
}

/**
 * Example 4: Streaming with React state management
 * 
 * This example shows how you might use streaming in a React component
 */
export function useWorkflowStreaming() {
  // In a real React component, you'd use useState here
  const state = {
    executionId: null as string | null,
    workflowId: null as string | null,
    updates: [] as StreamUpdate[],
    isRunning: false,
    result: null as any,
    error: null as string | null,
  };

  const runWorkflow = async (
    webhookUrl: string,
    payload: Record<string, unknown>
  ) => {
    // Reset state
    state.executionId = null;
    state.workflowId = null;
    state.updates = [];
    state.isRunning = true;
    state.result = null;
    state.error = null;

    const result = await callN8nWorkflow({
      webhookUrl,
      method: "POST",
      payload,
      streaming: {
        onStart: (executionId, workflowId) => {
          state.executionId = executionId;
          state.workflowId = workflowId || null;
          console.log("Workflow started:", executionId);
        },
        onUpdate: (update) => {
          state.updates.push(update);
          console.log("Update received:", update);
        },
        onComplete: (finalResult, executionId) => {
          state.result = finalResult;
          state.isRunning = false;
          console.log("Workflow completed:", executionId);
        },
        onError: (error, executionId) => {
          state.error = error;
          state.isRunning = false;
          console.error("Workflow error:", error);
        },
      },
    });

    return result;
  };

  return {
    state,
    runWorkflow,
  };
}

/**
 * Example 5: Without streaming (comparison)
 * 
 * This is how the existing code works - it waits for completion
 */
export async function answerQuestionWithoutStreaming(question: string) {
  const result = await callN8nWorkflow({
    webhookUrl: "http://localhost:5678/webhook/answer-question",
    method: "POST",
    payload: { question },
    waitForCompletion: true, // Blocks until workflow completes
  });

  // Result only available after workflow completes
  return {
    success: result.success,
    answer: result.data,
    executionId: result.executionId,
  };
}

/**
 * Example 6: Hybrid approach - immediate response + background streaming
 * 
 * Return immediately to user, but track progress in background
 */
export async function answerQuestionHybrid(question: string) {
  // Start the workflow with streaming
  const workflowPromise = callN8nWorkflow({
    webhookUrl: "http://localhost:5678/webhook/answer-question",
    method: "POST",
    payload: { question },
    streaming: {
      onStart: (executionId) => {
        console.log(`Background workflow started: ${executionId}`);
        // Could store this in a database or cache
      },
      onUpdate: (update) => {
        console.log(`Background update: ${update.stage}`);
        // Could update database or send notification
      },
      onComplete: (result, executionId) => {
        console.log(`Background workflow completed: ${executionId}`);
        // Could trigger webhook or notification to user
      },
      onError: (error) => {
        console.error(`Background workflow error: ${error}`);
        // Could send error notification
      },
    },
  });

  // Return immediately
  const initialResult = await workflowPromise;

  return {
    success: true,
    executionId: initialResult.executionId,
    workflowId: initialResult.workflowId,
    message: "Workflow started, you will be notified when complete",
  };
}

