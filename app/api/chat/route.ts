import { google } from "@ai-sdk/google";
import { streamText, UIMessage, convertToModelMessages, tool } from "ai";
import { callN8nWorkflow } from "@/lib/n8n-client";
import {
  getWorkflowWebhookUrl,
  getWorkflowDescription,
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
  
  if (!result || result.trim() === "") {
    console.error("[extractChatInput] No content extracted from messages!");
    // Fallback: try to get the last user message directly with more thorough extraction
    const userMessages = messages.filter(m => m.role === "user");
    const lastUserMessage = userMessages[userMessages.length - 1];
    
    if (lastUserMessage) {
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
      
      if (fallbackContent && fallbackContent.trim() !== "") {
        return fallbackContent;
      }
    }
    
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

  const paragonOS = tool({
    description: getWorkflowDescription("paragonOS"),
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "The natural language request, question, or instruction from the user to be handled by ParagonOS. Examples: 'Check for unreplied messages', 'DM sebastian about the meeting', 'What is the status of the deployment?'.",
        },
      },
      required: ["prompt"],
    },
    execute: async ({ prompt }: { prompt: string }) => {
      // The prompt parameter is required, but we'll still have a fallback
      let chatInput = prompt;
      
      // Validate the provided prompt
      if (!chatInput || chatInput.trim() === "") {
        console.warn("[paragonOS] Empty prompt parameter provided, attempting to extract from messages array");
        chatInput = extractChatInput(messages);
      }
      
      // Final validation
      if (!chatInput || chatInput.trim() === "") {
        return {
          success: false,
          error: "Cannot send empty request. The prompt parameter must contain the user's actual request or question.",
        };
      }
      
      console.log("[paragonOS] Using chatInput (length:", chatInput.length, "):", chatInput.substring(0, 100));
      
      // Get the stream URL for updates
      const streamUrl = getStreamUrl();
      
      // Prepare payload in the format N8N webhook expects
      const payload = {
        stage: "context_enrichment",
        status: "in_progress",
        message: "Processing request...",
        data: {
          chatInput: chatInput,
        },
        streamUrl: streamUrl,
      };
      
      const webhookUrl = getWorkflowWebhookUrl("paragonOS");
      if (!webhookUrl) {
        return {
          success: false,
          error: "ParagonOS workflow is not configured. Please set the webhook URL in n8n-config.ts",
        };
      }

      const result = await callN8nWorkflow({
        webhookUrl,
        method: "POST",
        payload,
      });

      if (!result.success) {
        return {
          success: false,
          error: result.error || "Failed to execute ParagonOS workflow",
        };
      }

      return {
        success: true,
        message: "Request sent to ParagonOS successfully",
        data: result.data,
      };
    },
  });

  const result = streamText({
    model: google("models/gemini-2.5-flash"),
    messages: convertToModelMessages(messages),
    tools: {
      paragonOS,
    },
  });

  return result.toUIMessageStreamResponse();
}
