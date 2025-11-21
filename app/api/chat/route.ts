import { google } from "@ai-sdk/google";
import { streamText, UIMessage, convertToModelMessages, tool } from "ai";
import { callN8nWorkflow } from "@/lib/n8n-client";
import {
  getWorkflowWebhookUrl,
  getWorkflowDescription,
} from "@/lib/n8n-config";

// Example of using streaming callbacks (currently not integrated with AI SDK streaming)
// To see real-time updates, workflows must send updates to /api/stream/update
// Updates will appear in the Stream Monitor tab
//
// const result = await callN8nWorkflow({
//   webhookUrl,
//   method: "POST",
//   payload: { question },
//   streaming: {
//     onStart: (executionId, workflowId) => {
//       console.log('[chat] Workflow started:', executionId);
//     },
//     onUpdate: (update) => {
//       console.log('[chat] Progress:', update.stage, update.message);
//     },
//     onComplete: (result, executionId) => {
//       console.log('[chat] Workflow completed:', executionId);
//     },
//     onError: (error) => {
//       console.error('[chat] Workflow error:', error);
//     },
//   },
// });

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const answerQuestion = tool({
    description: getWorkflowDescription("answerQuestion"),
    parameters: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "The question to answer using personal Telegram & Discord chat history",
        },
      },
      required: ["question"],
    },
    execute: async ({ question }) => {
      const webhookUrl = getWorkflowWebhookUrl("answerQuestion");
      if (!webhookUrl) {
        return {
          success: false,
          error: "Answer question workflow is not configured. Please set the webhook URL in n8n-config.ts",
        };
      }

      const result = await callN8nWorkflow({
        webhookUrl,
        method: "POST",
        payload: { question },
      });

      if (!result.success) {
        return {
          success: false,
          error: result.error || "Failed to execute workflow",
        };
      }

      return {
        success: true,
        answer: result.data,
      };
    },
  });

  const sendMessage = tool({
    description: getWorkflowDescription("sendMessage"),
    parameters: {
      type: "object",
      properties: {
        platform: {
          type: "string",
          enum: ["telegram", "discord"],
          description: "The platform to send the message to",
        },
        recipient: {
          type: "string",
          description: "The recipient (username, chat ID, or channel name)",
        },
        message: {
          type: "string",
          description: "The message content to send",
        },
      },
      required: ["platform", "recipient", "message"],
    },
    execute: async ({ platform, recipient, message }) => {
      const webhookUrl = getWorkflowWebhookUrl("sendMessage");
      if (!webhookUrl) {
        return {
          success: false,
          error: "Send message workflow is not configured. Please set the webhook URL in n8n-config.ts",
        };
      }

      const result = await callN8nWorkflow({
        webhookUrl,
        method: "POST",
        payload: { platform, recipient, message },
      });

      if (!result.success) {
        return {
          success: false,
          error: result.error || "Failed to send message",
        };
      }

      return {
        success: true,
        message: "Message sent successfully",
        data: result.data,
      };
    },
  });

  const generateTriage = tool({
    description: getWorkflowDescription("generateTriage"),
    parameters: {
      type: "object",
      properties: {
        context: {
          type: "string",
          description: "The context or information to generate a triage from",
        },
      },
      required: ["context"],
    },
    execute: async ({ context }) => {
      const webhookUrl = getWorkflowWebhookUrl("generateTriage");
      if (!webhookUrl) {
        return {
          success: false,
          error: "Generate triage workflow is not configured. Please set the webhook URL in n8n-config.ts",
        };
      }

      const result = await callN8nWorkflow({
        webhookUrl,
        method: "POST",
        payload: { context },
      });

      if (!result.success) {
        return {
          success: false,
          error: result.error || "Failed to generate triage",
        };
      }

      return {
        success: true,
        triage: result.data,
      };
    },
  });

  const callN8nWorkflowTool = tool({
    description: getWorkflowDescription("callN8nWorkflow"),
    parameters: {
      type: "object",
      properties: {
        webhookUrl: {
          type: "string",
          description: "The full webhook URL of the n8n workflow to call",
        },
        webhook_url: {
          type: "string",
          description: "The full webhook URL of the n8n workflow to call (alternative naming)",
        },
        payload: {
          type: "object",
          description: "The payload to send to the workflow",
        },
      },
      required: [],
    },
    execute: async (args) => {
      // Support both camelCase and snake_case parameter names
      const argsTyped = args as {
        webhookUrl?: string;
        webhook_url?: string;
        payload?: Record<string, unknown>;
      };
      const webhookUrl = argsTyped.webhookUrl || argsTyped.webhook_url;
      const payload = argsTyped.payload;

      if (!webhookUrl) {
        return {
          success: false,
          error: "Either webhookUrl or webhook_url must be provided",
        };
      }

      const result = await callN8nWorkflow({
        webhookUrl,
        method: "POST",
        payload: payload || {},
      });

      if (!result.success) {
        return {
          success: false,
          error: result.error || "Failed to execute workflow",
        };
      }

      return {
        success: true,
        data: result.data,
      };
    },
  });

  const result = streamText({
    model: google("models/gemini-2.5-flash"),
    messages: convertToModelMessages(messages),
    tools: {
      answerQuestion,
      sendMessage,
      generateTriage,
      callN8nWorkflow: callN8nWorkflowTool,
    },
  });

  return result.toUIMessageStreamResponse();
}
