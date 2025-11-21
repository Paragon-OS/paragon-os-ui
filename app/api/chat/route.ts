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
  if (!messages || messages.length === 0) {
    console.warn("[extractChatInput] Empty messages array");
    return "";
  }

  // Log messages for debugging
  console.log("[extractChatInput] Processing", messages.length, "messages");
  console.log("[extractChatInput] Messages structure:", JSON.stringify(messages.map(m => ({
    role: m.role,
    hasContent: !!m.content,
    contentType: typeof m.content,
    isArray: Array.isArray(m.content),
    contentLength: typeof m.content === "string" ? m.content.length : Array.isArray(m.content) ? m.content.length : 0
  })), null, 2));

  // Convert messages to a readable conversation format
  const conversationParts = messages
    .map((msg) => {
      const role = msg.role === "user" ? "User" : msg.role === "assistant" ? "Assistant" : "System";
      
      let content = "";
      
      if (typeof msg.content === "string") {
        content = msg.content;
      } else if (Array.isArray(msg.content)) {
        content = msg.content
          .map((part) => {
            if (typeof part === "string") return part;
            if (part && typeof part === "object") {
              // Handle text parts
              if (part.type === "text" && part.text) return part.text;
              // Handle other part types
              if (part.text) return part.text;
            }
            return "";
          })
          .filter(Boolean)
          .join("");
      }
      
      // Only include non-empty messages
      if (!content || content.trim() === "") {
        return null;
      }
      
      return `${role}: ${content}`;
    })
    .filter((part): part is string => part !== null);

  const result = conversationParts.join("\n\n");
  
  console.log("[extractChatInput] Extracted chatInput length:", result.length);
  console.log("[extractChatInput] Extracted chatInput preview:", result.substring(0, 200));
  
  if (!result || result.trim() === "") {
    console.error("[extractChatInput] No content extracted from messages!");
    // Fallback: try to get the last user message directly with more thorough extraction
    const userMessages = messages.filter(m => m.role === "user");
    const lastUserMessage = userMessages[userMessages.length - 1];
    
    if (lastUserMessage) {
      console.log("[extractChatInput] Attempting fallback extraction from last user message");
      console.log("[extractChatInput] Last user message:", JSON.stringify(lastUserMessage, null, 2));
      
      let fallbackContent = "";
      
      if (typeof lastUserMessage.content === "string") {
        fallbackContent = lastUserMessage.content;
      } else if (Array.isArray(lastUserMessage.content)) {
        fallbackContent = lastUserMessage.content
          .map((part: unknown) => {
            if (typeof part === "string") return part;
            if (part && typeof part === "object") {
              const partObj = part as Record<string, unknown>;
              if (partObj.text) return String(partObj.text);
              if (partObj.type === "text" && partObj.text) return String(partObj.text);
            }
            return "";
          })
          .filter(Boolean)
          .join("");
      }
      
      console.log("[extractChatInput] Fallback content extracted:", fallbackContent.substring(0, 200));
      
      if (fallbackContent && fallbackContent.trim() !== "") {
        return fallbackContent;
      }
    }
    
    // Last resort: return empty string and let the caller handle it
    console.error("[extractChatInput] Could not extract any content from messages!");
    return "";
  }

  return result;
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
    description: "Send a message via Telegram or Discord using the paragonos-send-message webhook. Use this tool when the user wants to send a message, call a POST webhook with a message, or send a message to someone (like 'who is cody on telegram'). This tool automatically calls the correct webhook URL and formats the payload correctly. The webhook URL is automatically determined - you don't need to provide it. IMPORTANT: Always provide the 'message' parameter with the user's actual request/message content.",
    parameters: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "The specific message or request from the user to send via Telegram or Discord. This should be the actual content the user wants to send or the question they're asking. Examples: 'who is cody on telegram', 'send hello to John', 'find messages from Alice'. REQUIRED: Always extract and provide the user's actual message content here - do not leave this empty.",
        },
      },
      required: ["message"],
    },
    execute: async ({ message }: { message: string }) => {
      // The message parameter is now required, but we'll still have a fallback
      let chatInput = message;
      
      // Validate the provided message
      if (!chatInput || chatInput.trim() === "") {
        console.warn("[sendMessage] Empty message parameter provided, attempting to extract from messages array");
        console.log("[sendMessage] Messages array length:", messages?.length || 0);
        chatInput = extractChatInput(messages);
      }
      
      // Final validation
      if (!chatInput || chatInput.trim() === "") {
        console.error("[sendMessage] Empty chatInput! Message param:", message, "Messages count:", messages?.length || 0);
        console.error("[sendMessage] Full messages array:", JSON.stringify(messages, null, 2));
        return {
          success: false,
          error: "Cannot send empty message. The message parameter must contain the user's actual request or question.",
        };
      }
      
      console.log("[sendMessage] Using chatInput (length:", chatInput.length, "):", chatInput.substring(0, 100));
      
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
