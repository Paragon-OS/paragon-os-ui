/**
 * n8n Streaming Client
 * Manages WebSocket/SSE connections to streaming server for real-time workflow updates
 */

import type { StreamUpdate, StreamingCallbacks } from "./types";
import { getStreamingServerUrl, getStreamingConnectionType } from "./config";

// Simple logger utility
const logger = {
  info: (message: string, ...args: unknown[]) => {
    console.log(`[n8n-streaming] ${message}`, ...args);
  },
  error: (message: string, error?: unknown) => {
    console.error(`[n8n-streaming] ${message}`, error);
  },
};

/**
 * Subscription for a specific execution
 */
interface ExecutionSubscription {
  executionId: string;
  callbacks: StreamingCallbacks;
}

/**
 * Streaming client that connects to the streaming server
 */
export class StreamingClient {
  private ws: WebSocket | null = null;
  private eventSource: EventSource | null = null;
  private connectionType: "websocket" | "sse";
  private serverUrl: string;
  private subscriptions: Map<string, ExecutionSubscription> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private isConnecting = false;
  private isConnected = false;

  constructor(serverUrl?: string, connectionType?: "websocket" | "sse") {
    this.serverUrl = serverUrl || getStreamingServerUrl();
    this.connectionType = connectionType || getStreamingConnectionType();
  }

  /**
   * Connect to the streaming server
   */
  async connect(): Promise<void> {
    if (this.isConnected || this.isConnecting) {
      logger.info("Already connected or connecting");
      return;
    }

    this.isConnecting = true;

    try {
      if (this.connectionType === "websocket") {
        await this.connectWebSocket();
      } else {
        await this.connectSSE();
      }
      this.isConnected = true;
      this.reconnectAttempts = 0;
      logger.info("Connected to streaming server");
    } catch (error) {
      logger.error("Failed to connect:", error);
      this.isConnected = false;
      this.scheduleReconnect();
    } finally {
      this.isConnecting = false;
    }
  }

  /**
   * Connect via WebSocket
   */
  private async connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const wsUrl = this.serverUrl.replace(/^http/, "ws") + "/stream/ws";
        logger.info(`Connecting to WebSocket: ${wsUrl}`);
        
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          logger.info("WebSocket connected");
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const update: StreamUpdate = JSON.parse(event.data);
            this.handleUpdate(update);
          } catch (error) {
            logger.error("Failed to parse WebSocket message:", error);
          }
        };

        this.ws.onerror = (error) => {
          logger.error("WebSocket error:", error);
          reject(error);
        };

        this.ws.onclose = () => {
          logger.info("WebSocket disconnected");
          this.isConnected = false;
          this.ws = null;
          this.scheduleReconnect();
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Connect via Server-Sent Events
   */
  private async connectSSE(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const sseUrl = `${this.serverUrl}/stream/sse/default`;
        logger.info(`Connecting to SSE: ${sseUrl}`);
        
        this.eventSource = new EventSource(sseUrl);

        this.eventSource.onopen = () => {
          logger.info("SSE connected");
          resolve();
        };

        this.eventSource.onmessage = (event) => {
          try {
            const update: StreamUpdate = JSON.parse(event.data);
            this.handleUpdate(update);
          } catch (error) {
            logger.error("Failed to parse SSE message:", error);
          }
        };

        this.eventSource.onerror = (error) => {
          logger.error("SSE error:", error);
          this.isConnected = false;
          this.eventSource?.close();
          this.eventSource = null;
          this.scheduleReconnect();
          reject(error);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error("Max reconnection attempts reached");
      return;
    }

    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    logger.info(`Scheduling reconnect attempt ${this.reconnectAttempts} in ${delay}ms`);
    
    setTimeout(() => {
      if (!this.isConnected && !this.isConnecting) {
        this.connect();
      }
    }, delay);
  }

  /**
   * Handle incoming update
   */
  private handleUpdate(update: StreamUpdate): void {
    logger.info(`Received update for execution: ${update.executionId}, stage: ${update.stage}, status: ${update.status}`);

    const subscription = this.subscriptions.get(update.executionId);
    if (!subscription) {
      logger.info(`No subscription found for execution: ${update.executionId}`);
      return;
    }

    const { callbacks } = subscription;

    // Call onUpdate callback
    if (callbacks.onUpdate) {
      try {
        callbacks.onUpdate(update);
      } catch (error) {
        logger.error("Error in onUpdate callback:", error);
      }
    }

    // Handle completion
    if (update.status === "completed") {
      if (callbacks.onComplete) {
        try {
          callbacks.onComplete(update.data, update.executionId);
        } catch (error) {
          logger.error("Error in onComplete callback:", error);
        }
      }
      // Unsubscribe after completion
      this.unsubscribe(update.executionId);
    }

    // Handle errors
    if (update.status === "error") {
      if (callbacks.onError) {
        try {
          callbacks.onError(update.message, update.executionId);
        } catch (error) {
          logger.error("Error in onError callback:", error);
        }
      }
      // Unsubscribe after error
      this.unsubscribe(update.executionId);
    }
  }

  /**
   * Subscribe to updates for a specific execution
   */
  subscribe(executionId: string, callbacks: StreamingCallbacks): void {
    logger.info(`Subscribing to execution: ${executionId}`);
    
    this.subscriptions.set(executionId, {
      executionId,
      callbacks,
    });

    // Ensure we're connected
    if (!this.isConnected && !this.isConnecting) {
      this.connect();
    }
  }

  /**
   * Unsubscribe from execution updates
   */
  unsubscribe(executionId: string): void {
    logger.info(`Unsubscribing from execution: ${executionId}`);
    this.subscriptions.delete(executionId);
  }

  /**
   * Disconnect from streaming server
   */
  disconnect(): void {
    logger.info("Disconnecting from streaming server");
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    this.isConnected = false;
    this.isConnecting = false;
    this.subscriptions.clear();
  }

  /**
   * Check if client is connected
   */
  isClientConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Get number of active subscriptions
   */
  getSubscriptionCount(): number {
    return this.subscriptions.size;
  }
}

// Singleton instance
let globalStreamingClient: StreamingClient | null = null;

/**
 * Get or create the global streaming client instance
 */
export function getStreamingClient(): StreamingClient {
  if (!globalStreamingClient) {
    globalStreamingClient = new StreamingClient();
  }
  return globalStreamingClient;
}

/**
 * Create a new streaming client instance
 */
export function createStreamingClient(
  serverUrl?: string,
  connectionType?: "websocket" | "sse"
): StreamingClient {
  return new StreamingClient(serverUrl, connectionType);
}

