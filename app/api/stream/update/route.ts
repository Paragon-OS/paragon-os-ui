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

    // Validate required fields
    if (!body.executionId) {
      return NextResponse.json(
        { success: false, error: "executionId is required" },
        { status: 400 }
      );
    }

    // Create update object
    const update: StreamUpdate = {
      executionId: body.executionId,
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

