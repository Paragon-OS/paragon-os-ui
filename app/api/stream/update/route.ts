/**
 * Stream Update Endpoint
 * Receives updates from n8n workflows and broadcasts them to SSE clients
 */

import { streamingStore } from "@/lib/streaming-store";
import { NextRequest, NextResponse } from "next/server";
import type { StreamUpdate } from "@/lib/n8n-client/types";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Log the received body for debugging
    console.log("[update] Received request body:", JSON.stringify(body, null, 2));
    console.log("[update] Query params:", Object.fromEntries(request.nextUrl.searchParams));
    console.log("[update] Headers:", Object.fromEntries(request.headers.entries()));

    // Validate required fields - check for executionId in various possible locations
    // 1. Check request body first
    let executionId = body.executionId;
    
    // 2. If executionId is not at top level, check in data object
    if (executionId === undefined && body.data && body.data.executionId !== undefined) {
      executionId = body.data.executionId;
    }
    
    // 3. Check query parameters as fallback
    if (executionId === undefined) {
      const queryExecutionId = request.nextUrl.searchParams.get("executionId");
      if (queryExecutionId) {
        executionId = queryExecutionId;
      }
    }
    
    // 4. Check headers as fallback
    if (executionId === undefined) {
      const headerExecutionId = request.headers.get("x-execution-id") || 
                                 request.headers.get("execution-id") ||
                                 request.headers.get("x-n8n-execution-id");
      if (headerExecutionId) {
        executionId = headerExecutionId;
      }
    }
    
    // Convert to string if it's a number (n8n might send it as a number)
    // Note: 0 is a valid executionId, so we check for undefined/null specifically
    if (executionId !== undefined && executionId !== null) {
      executionId = String(executionId);
    }

    if (executionId === undefined || executionId === null || executionId === "") {
      console.error("[update] Missing executionId. Received body keys:", Object.keys(body).join(", "));
      console.error("[update] Full body:", JSON.stringify(body, null, 2));
      
      const receivedKeys = Object.keys(body);
      
      return NextResponse.json(
        { 
          success: false, 
          error: "executionId is required but was not found in the request.",
          problem: `Your HTTP Request node sent a body with only these fields: ${receivedKeys.join(", ") || "none"}. The executionId field is missing.`,
          solution: {
            step1: "In your n8n HTTP Request node (the one that POSTs to streamUrl), set 'Specify Body' to 'JSON'",
            step2: "Set 'JSON Body' to include executionId. Example:",
            example: {
              executionId: "{{ $execution.id }}",
              stage: "{{ $json.stage }}",
              status: "{{ $json.status }}",
              message: "{{ $json.message }}",
              timestamp: "{{ $now }}",
              data: "{{ $json.data }}"
            },
            note: "Make sure 'executionId' is included in the JSON body, not just timestamp."
          },
          receivedBody: body,
          queryParams: Object.fromEntries(request.nextUrl.searchParams),
          headers: {
            "x-execution-id": request.headers.get("x-execution-id"),
            "execution-id": request.headers.get("execution-id"),
            "x-n8n-execution-id": request.headers.get("x-n8n-execution-id"),
          }
        },
        { status: 400 }
      );
    }

    // Create update object
    const update: StreamUpdate = {
      executionId: executionId,
      stage: body.stage || "unknown",
      status: body.status || "info",
      message: body.message || "",
      timestamp: body.timestamp || new Date().toISOString(),
      data: body.data || {},
    };

    console.log(
      `[update] Received update for execution: ${update.executionId}, stage: ${update.stage}, status: ${update.status}`
    );
    console.log(`[update] Message: ${update.message}`);

    // Store update in history
    streamingStore.addUpdate(update);

    // Broadcast to all connected clients
    streamingStore.broadcast(update);

    return NextResponse.json({
      success: true,
      message: "Update broadcasted",
      executionId: update.executionId,
    });
  } catch (error) {
    console.error("[update] Error processing update:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// Handle OPTIONS for CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

