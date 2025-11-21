import { google } from "@ai-sdk/google";
import { streamText, UIMessage, convertToModelMessages, tool } from "ai";
import { callN8nWorkflow } from "@/lib/n8n-client";
import {
  getWorkflowWebhookUrl,
  getWorkflowDescription,
  getParagonosSendMessageWebhookUrl,
} from "@/lib/n8n-config";

/**
 * Extract chatInput from messages array
 * Converts the conversation history into a format suitable for N8N workflows
 */
function extractChatInput(messages: UIMessage[]): string {
  // Convert messages to a readable conversation format
  const conversationParts = messages.map((msg) => {
    const role = msg.role === "user" ? "User" : msg.role === "assistant" ? "Assistant" : "System";
    const content = typeof msg.content === "string" 
      ? msg.content 
      : Array.isArray(msg.content)
      ? msg.content
          .map((part) => {
            if (typeof part === "string") return part;
            if (part.type === "text") return part.text || "";
            return "";
          })
          .join("")
      : "";
    
    return `${role}: ${content}`;
  });

  return conversationParts.join("\n\n");
}

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();
  
  // Get the base URL from the request for constructing stream URL
  const getStreamUrl = () => {
    if (process.env.NEXT_PUBLIC_APP_URL) {
      return `${process.env.NEXT_PUBLIC_APP_URL}/api/stream/update`;
    }
    // Try to get from request headers
    const host = req.headers.get("host");
    const protocol = req.headers.get("x-forwarded-proto") || "http";
    if (host) {
      return `${protocol}://${host}/api/stream/update`;
    }
    // Fallback to localhost for development
    return "http://localhost:3000/api/stream/update";
  };

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
    description: "Send a message via Telegram or Discord using the paragonos-send-message webhook. Use this tool when the user wants to send a message, call a POST webhook with a message, or send a message to someone (like 'who is cody on telegram'). This tool automatically calls the correct webhook URL and formats the payload correctly. The webhook URL is automatically determined - you don't need to provide it.",
    parameters: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "The specific message to send via Telegram or Discord. Examples: 'who is cody on telegram', 'send hello to John', etc. If not provided, the entire conversation history will be used.",
        },
      },
      required: [],
    },
    execute: async ({ message }: { message?: string }) => {
      // Use provided message or extract chatInput from conversation history
      const chatInput = message || extractChatInput(messages);
      
      // Get the stream URL for updates
      const streamUrl = getStreamUrl();
      
      // Prepare payload in the format N8N webhook expects
      // Note: executionId is not included here as N8N will generate it using {{ $execution.id }}
      const payload = {
        stage: "context_enrichment",
        status: "in_progress",
        message: "Processing message...",
        data: {
          chatInput: chatInput,
        },
        streamUrl: streamUrl,
      };
      
      // Try test endpoint first, fall back to production if needed
      let webhookUrl = getParagonosSendMessageWebhookUrl(true);
      let result = await callN8nWorkflow({
        webhookUrl,
        method: "POST",
        payload,
      });

      // If test endpoint fails, try production endpoint
      if (!result.success && webhookUrl.includes("/webhook-test/")) {
        webhookUrl = getParagonosSendMessageWebhookUrl(false);
        result = await callN8nWorkflow({
          webhookUrl,
          method: "POST",
          payload,
        });
      }

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
