"use client";

import { useEffect, useState, useRef } from "react";
import type { StreamUpdate } from "@/lib/n8n-client/types";

interface StreamMonitorProps {
  executionIds?: string[]; // Optional: filter to specific executions
  autoConnect?: boolean;
}

export function StreamMonitor({
  executionIds = [],
  autoConnect = true,
}: StreamMonitorProps) {
  const [updates, setUpdates] = useState<StreamUpdate[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionType, setConnectionType] = useState<"all" | "filtered">(
    executionIds.length > 0 ? "filtered" : "all"
  );
  const eventSourceRef = useRef<EventSource | null>(null);
  const updatesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new updates arrive
  useEffect(() => {
    updatesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [updates]);

  // Connect to SSE endpoint
  const connect = () => {
    // Clean up any existing connection first
    if (eventSourceRef.current) {
      console.log("[stream-monitor] Closing existing connection before reconnecting");
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    const executionId =
      connectionType === "filtered" && executionIds.length > 0
        ? executionIds[0]
        : "default";

    const sseUrl = `/api/stream/sse/${executionId}`;
    console.log(`[stream-monitor] Connecting to SSE: ${sseUrl}`);

    try {
      const eventSource = new EventSource(sseUrl);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        setIsConnected(true);
        console.log("[stream-monitor] SSE connected");
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Skip connection messages
          if (data.type === "connected") {
            console.log("[stream-monitor] Connected to SSE stream");
            return;
          }

          const update: StreamUpdate = data;
          
          // Filter by execution IDs if specified
          if (
            connectionType === "filtered" &&
            executionIds.length > 0 &&
            !executionIds.includes(update.executionId)
          ) {
            return;
          }

          console.log("[stream-monitor] Received update:", update);
          setUpdates((prev) => [...prev, update]);
        } catch (error) {
          console.error("[stream-monitor] Failed to parse update:", error);
        }
      };

      eventSource.onerror = (error) => {
        // ReadyState: 0 = CONNECTING, 1 = OPEN, 2 = CLOSED
        const state = eventSource.readyState;
        
        // In development, HMR/Fast Refresh will close connections - this is normal
        if (state === 2) {
          console.log("[stream-monitor] SSE connection closed (this is normal during development hot reload)");
          setIsConnected(false);
          eventSource.close();
          eventSourceRef.current = null;
        } else {
          console.error("[stream-monitor] SSE error:", error);
          console.error("[stream-monitor] EventSource readyState:", state);
        }
      };
    } catch (error) {
      console.error("[stream-monitor] Failed to create EventSource:", error);
      setIsConnected(false);
    }
  };

  // Disconnect from SSE
  const disconnect = () => {
    if (eventSourceRef.current) {
      console.log("[stream-monitor] Manually disconnecting from SSE");
      const es = eventSourceRef.current;
      eventSourceRef.current = null; // Clear ref first to prevent reconnection attempts
      es.close();
      setIsConnected(false);
    }
  };

  // Clear all updates
  const clearUpdates = () => {
    setUpdates([]);
  };

  // Auto-connect on mount if enabled
  useEffect(() => {
    let mounted = true;

    if (autoConnect && mounted) {
      // Small delay to prevent double-mounting issues in React strict mode
      const timer = setTimeout(() => {
        if (mounted) {
          connect();
        }
      }, 100);

      return () => {
        mounted = false;
        clearTimeout(timer);
        disconnect();
      };
    }

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnect]);

  // Update connection type when executionIds change
  useEffect(() => {
    const newConnectionType = executionIds.length > 0 ? "filtered" : "all";
    
    // Only reconnect if connection type actually changed
    if (newConnectionType !== connectionType) {
      setConnectionType(newConnectionType);
      
      // Reconnect if already connected
      if (eventSourceRef.current) {
        disconnect();
        setTimeout(() => connect(), 100);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [executionIds]);

  const getStatusColor = (status: string): string => {
    switch (status) {
      case "completed":
        return "bg-green-500";
      case "error":
        return "bg-red-500";
      case "in_progress":
        return "bg-orange-500";
      default:
        return "bg-blue-500";
    }
  };

  const getStatusTextColor = (status: string): string => {
    switch (status) {
      case "completed":
        return "text-green-400";
      case "error":
        return "text-red-400";
      case "in_progress":
        return "text-orange-400";
      default:
        return "text-blue-400";
    }
  };

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/stream/update`
      : "http://localhost:3000/api/stream/update";

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    // Could add a toast notification here
    console.log("Webhook URL copied to clipboard!");
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="border-b p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">Stream Monitor</h2>
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  isConnected ? "bg-green-500" : "bg-red-500"
                }`}
              />
              <span className="text-sm text-muted-foreground">
                {isConnected ? "Connected" : "Disconnected"}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            {!isConnected && (
              <button
                onClick={connect}
                className="px-3 py-1 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90"
              >
                Connect
              </button>
            )}
            {isConnected && (
              <button
                onClick={disconnect}
                className="px-3 py-1 text-sm bg-destructive text-destructive-foreground rounded hover:bg-destructive/90"
              >
                Disconnect
              </button>
            )}
            <button
              onClick={clearUpdates}
              className="px-3 py-1 text-sm bg-secondary text-secondary-foreground rounded hover:bg-secondary/80"
            >
              Clear
            </button>
          </div>
        </div>
        
        {/* Webhook URL */}
        <div className="bg-muted rounded p-2 flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-medium">
            n8n Webhook URL:
          </span>
          <code className="flex-1 text-xs bg-background px-2 py-1 rounded font-mono">
            {webhookUrl}
          </code>
          <button
            onClick={copyWebhookUrl}
            className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90"
            title="Copy to clipboard"
          >
            Copy
          </button>
        </div>
      </div>

      {/* Updates List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {updates.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            {isConnected
              ? "Waiting for workflow updates..."
              : "Connect to see real-time workflow updates"}
          </div>
        ) : (
          updates.map((update, index) => (
            <div
              key={`${update.executionId}-${update.timestamp}-${index}`}
              className="border rounded-lg p-3 bg-card"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    {update.executionId.slice(0, 8)}...
                  </span>
                  <span
                    className={`text-xs font-semibold uppercase ${getStatusTextColor(
                      update.status
                    )}`}
                  >
                    {update.stage}
                  </span>
                </div>
                <span
                  className={`px-2 py-0.5 text-xs font-medium rounded ${getStatusColor(
                    update.status
                  )} text-white`}
                >
                  {update.status}
                </span>
              </div>

              {/* Message */}
              <div className="text-sm mb-2">{update.message}</div>

              {/* Timestamp */}
              <div className="text-xs text-muted-foreground mb-2">
                {new Date(update.timestamp).toLocaleString()}
              </div>

              {/* Data */}
              {update.data && Object.keys(update.data).length > 0 && (
                <div className="mt-2 p-2 bg-muted rounded text-xs font-mono overflow-x-auto">
                  <pre>{JSON.stringify(update.data, null, 2)}</pre>
                </div>
              )}
            </div>
          ))
        )}
        <div ref={updatesEndRef} />
      </div>

      {/* Footer */}
      <div className="border-t p-2 text-xs text-muted-foreground text-center">
        {updates.length} update{updates.length !== 1 ? "s" : ""} received
        {connectionType === "filtered" && executionIds.length > 0 && (
          <span> • Filtering {executionIds.length} execution(s)</span>
        )}
      </div>
    </div>
  );
}

