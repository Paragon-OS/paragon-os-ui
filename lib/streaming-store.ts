/**
 * Streaming Store
 * In-memory state management for SSE connections and update history
 */

import type { StreamUpdate } from "./n8n-client/types";

// Type for SSE connection with encoder
interface SSEConnection {
  encoder: TextEncoder;
  controller: ReadableStreamDefaultController;
}

class StreamingStore {
  // Map of executionId -> Set of SSE connections
  private connections: Map<string, Set<SSEConnection>> = new Map();

  // Map of executionId -> Array of updates (last 100)
  private updateHistory: Map<string, StreamUpdate[]> = new Map();

  // Maximum updates to keep per execution
  private readonly MAX_HISTORY = 100;

  /**
   * Add a new SSE connection
   */
  addConnection(executionId: string, connection: SSEConnection): void {
    if (!this.connections.has(executionId)) {
      this.connections.set(executionId, new Set());
    }
    this.connections.get(executionId)!.add(connection);
    console.log(`[streaming-store] Added connection for execution: ${executionId}`);
    console.log(`[streaming-store] Total connections for ${executionId}: ${this.connections.get(executionId)!.size}`);
  }

  /**
   * Remove an SSE connection
   */
  removeConnection(executionId: string, connection: SSEConnection): void {
    const execConnections = this.connections.get(executionId);
    if (execConnections) {
      execConnections.delete(connection);
      console.log(`[streaming-store] Removed connection for execution: ${executionId}`);
      console.log(`[streaming-store] Remaining connections for ${executionId}: ${execConnections.size}`);
      
      if (execConnections.size === 0) {
        this.connections.delete(executionId);
        console.log(`[streaming-store] No more connections for ${executionId}, removed from map`);
      }
    }
  }

  /**
   * Get all connections for an execution ID
   */
  getConnections(executionId: string): Set<SSEConnection> {
    return this.connections.get(executionId) || new Set();
  }

  /**
   * Get total number of active connections
   */
  getConnectionCount(): number {
    let total = 0;
    for (const connections of this.connections.values()) {
      total += connections.size;
    }
    return total;
  }

  /**
   * Add an update to history
   */
  addUpdate(update: StreamUpdate): void {
    const { executionId } = update;
    
    if (!this.updateHistory.has(executionId)) {
      this.updateHistory.set(executionId, []);
    }
    
    const history = this.updateHistory.get(executionId)!;
    history.push(update);
    
    // Keep only last MAX_HISTORY updates
    if (history.length > this.MAX_HISTORY) {
      history.shift();
    }
    
    console.log(`[streaming-store] Added update for execution: ${executionId}, stage: ${update.stage}, status: ${update.status}`);
    console.log(`[streaming-store] History size for ${executionId}: ${history.length}`);
  }

  /**
   * Get update history for an execution
   */
  getHistory(executionId: string): StreamUpdate[] {
    return this.updateHistory.get(executionId) || [];
  }

  /**
   * Get all execution IDs being tracked
   */
  getTrackedExecutions(): string[] {
    return Array.from(this.updateHistory.keys());
  }

  /**
   * Get number of tracked executions
   */
  getTrackedExecutionCount(): number {
    return this.updateHistory.size;
  }

  /**
   * Broadcast update to all connections for an execution
   */
  broadcast(update: StreamUpdate): void {
    const { executionId } = update;
    
    // Broadcast to specific execution connections
    const execConnections = this.getConnections(executionId);
    
    // Also broadcast to 'default' connections (listening to all)
    const defaultConnections = this.getConnections('default');
    
    const allConnections = new Set([...execConnections, ...defaultConnections]);
    
    console.log(`[streaming-store] Broadcasting update for ${executionId} to ${allConnections.size} connection(s)`);
    
    const data = `data: ${JSON.stringify(update)}\n\n`;
    
    allConnections.forEach((connection) => {
      try {
        connection.controller.enqueue(connection.encoder.encode(data));
      } catch (error) {
        console.error(`[streaming-store] Error sending to connection:`, error);
        // Connection might be closed, will be cleaned up on next request
      }
    });
  }

  /**
   * Clear history for a specific execution (optional cleanup)
   */
  clearHistory(executionId: string): void {
    this.updateHistory.delete(executionId);
    console.log(`[streaming-store] Cleared history for execution: ${executionId}`);
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      activeConnections: this.getConnectionCount(),
      trackedExecutions: this.getTrackedExecutionCount(),
      executionIds: this.getTrackedExecutions(),
    };
  }
}

// Export singleton instance
export const streamingStore = new StreamingStore();

