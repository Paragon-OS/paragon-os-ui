# n8n Client Streaming Usage Guide

This guide demonstrates how to use the streaming functionality in the n8n-client to get immediate execution IDs and real-time workflow updates.

## Overview

The streaming feature allows you to:
1. Get workflow ID and execution ID immediately when a workflow starts
2. Receive real-time updates as the workflow progresses
3. Get notified when the workflow completes or encounters errors
4. Handle multiple concurrent workflow executions

## Prerequisites

1. **Streaming Server**: You need a streaming server running (default: `http://localhost:3001`)
   - Use the provided `server.js` from the streaming-server directory
   - Or set `N8N_STREAMING_SERVER_URL` environment variable to your server URL

2. **n8n Workflow Configuration**: Your n8n workflows must send updates to the streaming server
   - Add HTTP Request nodes in your workflow to POST updates to `http://localhost:3001/stream/update`
   - Include execution ID, stage, status, message, and data in the payload

## Environment Variables

```bash
# Optional: Streaming server URL (default: http://localhost:3001)
N8N_STREAMING_SERVER_URL=http://localhost:3001

# Optional: Connection type - 'websocket' or 'sse' (default: websocket)
N8N_STREAMING_CONNECTION_TYPE=websocket
```

## Basic Usage

### Example 1: Simple Streaming Call

```typescript
import { callN8nWorkflow } from '@/lib/n8n-client';

const result = await callN8nWorkflow({
  webhookUrl: 'http://localhost:5678/webhook/my-workflow',
  method: 'POST',
  payload: { question: 'What is the weather?' },
  streaming: {
    onStart: (executionId, workflowId) => {
      console.log('Workflow started!');
      console.log('Execution ID:', executionId);
      console.log('Workflow ID:', workflowId);
    },
    onUpdate: (update) => {
      console.log('Update received:', update.stage, update.status);
      console.log('Message:', update.message);
      if (update.data) {
        console.log('Data:', update.data);
      }
    },
    onComplete: (result, executionId) => {
      console.log('Workflow completed!');
      console.log('Execution ID:', executionId);
      console.log('Result:', result);
    },
    onError: (error, executionId) => {
      console.error('Workflow error:', error);
      if (executionId) {
        console.error('Execution ID:', executionId);
      }
    },
  },
});

// Result is returned immediately with execution IDs
console.log('Immediate response:', result);
// {
//   success: true,
//   executionId: '12345',
//   workflowId: 'abc-def',
//   streaming: true,
//   data: { message: 'Workflow started, streaming updates enabled' }
// }
```

### Example 2: React Component with Streaming

```typescript
import { useState } from 'react';
import { callN8nWorkflow, StreamUpdate } from '@/lib/n8n-client';

function WorkflowRunner() {
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [updates, setUpdates] = useState<StreamUpdate[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<any>(null);

  const runWorkflow = async () => {
    setIsRunning(true);
    setUpdates([]);
    setResult(null);

    const response = await callN8nWorkflow({
      webhookUrl: 'http://localhost:5678/webhook/my-workflow',
      method: 'POST',
      payload: { input: 'test data' },
      streaming: {
        onStart: (execId, workflowId) => {
          setExecutionId(execId);
          console.log('Started:', execId, workflowId);
        },
        onUpdate: (update) => {
          setUpdates(prev => [...prev, update]);
        },
        onComplete: (finalResult, execId) => {
          setResult(finalResult);
          setIsRunning(false);
          console.log('Completed:', execId);
        },
        onError: (error) => {
          console.error('Error:', error);
          setIsRunning(false);
        },
      },
    });

    console.log('Initial response:', response);
  };

  return (
    <div>
      <button onClick={runWorkflow} disabled={isRunning}>
        Run Workflow
      </button>
      
      {executionId && (
        <div>
          <h3>Execution ID: {executionId}</h3>
          <p>Status: {isRunning ? 'Running...' : 'Completed'}</p>
        </div>
      )}

      <div>
        <h3>Updates:</h3>
        {updates.map((update, idx) => (
          <div key={idx} style={{ 
            padding: '10px', 
            margin: '5px', 
            border: '1px solid #ccc' 
          }}>
            <strong>{update.stage}</strong> - {update.status}
            <p>{update.message}</p>
            {update.data && <pre>{JSON.stringify(update.data, null, 2)}</pre>}
          </div>
        ))}
      </div>

      {result && (
        <div>
          <h3>Final Result:</h3>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
```

### Example 3: Multiple Concurrent Workflows

```typescript
import { callN8nWorkflow } from '@/lib/n8n-client';

// Track multiple workflows simultaneously
const workflows = [
  { id: 'workflow1', url: 'http://localhost:5678/webhook/workflow-1' },
  { id: 'workflow2', url: 'http://localhost:5678/webhook/workflow-2' },
  { id: 'workflow3', url: 'http://localhost:5678/webhook/workflow-3' },
];

const results = await Promise.all(
  workflows.map(workflow => 
    callN8nWorkflow({
      webhookUrl: workflow.url,
      method: 'POST',
      payload: { workflowId: workflow.id },
      streaming: {
        onStart: (executionId) => {
          console.log(`${workflow.id} started: ${executionId}`);
        },
        onUpdate: (update) => {
          console.log(`${workflow.id} update:`, update.stage, update.message);
        },
        onComplete: (result, executionId) => {
          console.log(`${workflow.id} completed: ${executionId}`);
        },
        onError: (error) => {
          console.error(`${workflow.id} error:`, error);
        },
      },
    })
  )
);

console.log('All workflows started:', results);
```

### Example 4: Manual Streaming Client Management

```typescript
import { createStreamingClient } from '@/lib/n8n-client';

// Create a custom streaming client instance
const streamingClient = createStreamingClient(
  'http://localhost:3001',
  'websocket'
);

// Manually connect
await streamingClient.connect();

// Subscribe to a specific execution
streamingClient.subscribe('execution-id-123', {
  onUpdate: (update) => {
    console.log('Update:', update);
  },
  onComplete: (result) => {
    console.log('Complete:', result);
  },
  onError: (error) => {
    console.error('Error:', error);
  },
});

// Check connection status
console.log('Connected:', streamingClient.isClientConnected());
console.log('Active subscriptions:', streamingClient.getSubscriptionCount());

// Unsubscribe when done
streamingClient.unsubscribe('execution-id-123');

// Disconnect when finished
streamingClient.disconnect();
```

## n8n Workflow Configuration

To send updates from your n8n workflow to the streaming server, add HTTP Request nodes at key stages:

```json
{
  "method": "POST",
  "url": "http://localhost:3001/stream/update",
  "body": {
    "executionId": "{{ $execution.id }}",
    "stage": "processing",
    "status": "in_progress",
    "message": "Processing data...",
    "timestamp": "{{ $now }}",
    "data": {
      "progress": 50,
      "itemsProcessed": 10
    }
  }
}
```

### Update Statuses

- `in_progress`: Workflow is still running
- `completed`: Workflow finished successfully
- `error`: Workflow encountered an error
- `info`: Informational update

### Example Workflow Structure

1. **Start Node** → HTTP Request (send "started" update)
2. **Processing Node** → HTTP Request (send "in_progress" update)
3. **More Processing** → HTTP Request (send "in_progress" update)
4. **Final Node** → HTTP Request (send "completed" update with results)
5. **Error Handler** → HTTP Request (send "error" update)

## Comparison: Streaming vs Polling

### Without Streaming (Polling)
```typescript
// Waits for entire workflow to complete before returning
const result = await callN8nWorkflow({
  webhookUrl: 'http://localhost:5678/webhook/my-workflow',
  method: 'POST',
  payload: { input: 'data' },
  waitForCompletion: true, // Blocks until complete
});

console.log('Result:', result.data); // Only available after completion
```

### With Streaming
```typescript
// Returns immediately with execution ID, updates arrive in real-time
const result = await callN8nWorkflow({
  webhookUrl: 'http://localhost:5678/webhook/my-workflow',
  method: 'POST',
  payload: { input: 'data' },
  streaming: {
    onStart: (executionId) => {
      console.log('Started immediately:', executionId);
    },
    onUpdate: (update) => {
      console.log('Real-time update:', update);
    },
    onComplete: (finalResult) => {
      console.log('Final result:', finalResult);
    },
  },
});

console.log('Execution ID:', result.executionId); // Available immediately!
```

## Troubleshooting

### No Updates Received

1. Check that the streaming server is running: `http://localhost:3001/health`
2. Verify your n8n workflow is sending updates to the streaming server
3. Check browser console for WebSocket/SSE connection errors
4. Ensure execution ID matches between n8n and streaming server

### Execution ID Not Found

1. Make sure `N8N_API_KEY` is set in your environment
2. Check that the n8n workflow is configured to return execution ID
3. Verify the workflow URL is correct

### Connection Issues

1. Check `N8N_STREAMING_SERVER_URL` is set correctly
2. Try switching connection type: `N8N_STREAMING_CONNECTION_TYPE=sse`
3. Check CORS settings on the streaming server
4. Verify firewall/network settings

## Advanced Features

### Graceful Degradation

If the streaming server is unavailable, the client will:
1. Attempt to reconnect automatically (up to 5 times)
2. Log connection errors to console
3. Continue to work in non-streaming mode if streaming is not critical

### Connection Pooling

The default `getStreamingClient()` returns a singleton instance that:
- Reuses WebSocket/SSE connections across multiple workflow calls
- Manages multiple execution subscriptions on a single connection
- Automatically reconnects if the connection drops

### Custom Server Configuration

```typescript
import { createStreamingClient } from '@/lib/n8n-client';

const client = createStreamingClient(
  'https://my-streaming-server.com',
  'sse' // or 'websocket'
);
```

## Best Practices

1. **Always handle all callbacks**: Implement `onStart`, `onUpdate`, `onComplete`, and `onError`
2. **Clean up subscriptions**: The client automatically unsubscribes after completion/error
3. **Use the singleton client**: Call `getStreamingClient()` for shared connection
4. **Monitor connection status**: Check `isClientConnected()` if needed
5. **Test with streaming server**: Always run the streaming server in development
6. **Configure workflows properly**: Ensure n8n workflows send updates at key stages

