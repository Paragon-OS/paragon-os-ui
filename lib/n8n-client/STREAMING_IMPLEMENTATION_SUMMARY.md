# Streaming n8n Client Implementation Summary

## Overview

The n8n-client has been enhanced with real-time streaming capabilities, allowing immediate return of execution IDs with callback-based progress updates.

## What Was Implemented

### 1. New Types (`types.ts`)

Added streaming-related type definitions:
- `StreamUpdate`: Interface for streaming updates (stage, status, message, timestamp, data)
- `StreamingCallbacks`: Interface with `onStart`, `onUpdate`, `onComplete`, `onError` callbacks
- Extended `N8nWorkflowCallOptions` with optional `streaming` property
- Extended `N8nWorkflowResponse` with `streaming` flag

### 2. Streaming Client (`streaming.ts`)

Created a complete WebSocket/SSE client with:
- `StreamingClient` class for managing connections
- Automatic reconnection logic (up to 5 attempts with exponential backoff)
- Support for both WebSocket and Server-Sent Events (SSE)
- Multiple concurrent execution subscription system
- Singleton pattern via `getStreamingClient()` for connection reuse
- Manual client creation via `createStreamingClient()`

Key Features:
- Connection management (connect, disconnect, reconnect)
- Event handling for incoming updates
- Callback invocation for registered execution listeners
- Automatic cleanup after completion or error

### 3. Configuration (`config.ts`)

Added streaming server configuration:
- `N8N_STREAMING_SERVER_URL` environment variable (default: `http://localhost:3001`)
- `N8N_STREAMING_CONNECTION_TYPE` environment variable (default: `websocket`)
- `getStreamingServerUrl()` function
- `getStreamingConnectionType()` function

### 4. Webhook Module Updates (`webhook.ts`)

Enhanced webhook calling with streaming support:
- Added `streamingCallbacks` parameter to `callWebhook()`
- Early extraction of execution ID and workflow ID
- Immediate return when streaming is enabled
- Automatic subscription to streaming updates
- Fallback to API lookup if execution ID not in response
- Maintains backward compatibility (non-streaming mode still works)

Flow:
1. Call webhook to start execution
2. Extract execution ID and workflow ID
3. Call `onStart` callback immediately
4. Subscribe to streaming client
5. Return response with IDs without waiting
6. Updates arrive via callbacks as workflow progresses

### 5. Main Entry Point (`index.ts`)

Updated exports and main function:
- Export streaming types: `StreamUpdate`, `StreamingCallbacks`
- Export streaming functions: `getStreamingClient`, `createStreamingClient`
- Updated `callN8nWorkflow()` to pass streaming callbacks to webhook module
- Added warning for streaming with local API calls (not supported)

## How It Works

### Architecture

```
┌─────────────────┐
│   Your App      │
│  (React/Next)   │
└────────┬────────┘
         │ callN8nWorkflow({ streaming: {...} })
         ▼
┌─────────────────┐
│  n8n-client     │
│  (webhook.ts)   │
└────┬───────┬────┘
     │       │
     │       └──────────────────┐
     │                          │
     ▼                          ▼
┌─────────────┐      ┌──────────────────┐
│   n8n       │      │ Streaming Client │
│  Workflow   │      │   (streaming.ts) │
└──────┬──────┘      └────────┬─────────┘
       │                      │
       │                      │ WebSocket/SSE
       │                      ▼
       │             ┌──────────────────┐
       │             │ Streaming Server │
       │             │   (server.js)    │
       │             └────────▲─────────┘
       │                      │
       └──────────────────────┘
          HTTP POST /stream/update
```

### Execution Flow

1. **User calls workflow with streaming callbacks**
   ```typescript
   callN8nWorkflow({
     webhookUrl: '...',
     streaming: { onStart, onUpdate, onComplete, onError }
   })
   ```

2. **Webhook is called, execution starts**
   - n8n starts workflow execution
   - Response may include execution ID

3. **Immediate return with IDs**
   - Extract execution ID (from response or via API lookup)
   - Call `onStart(executionId, workflowId)`
   - Subscribe to streaming client
   - Return response immediately

4. **Workflow sends updates to streaming server**
   - n8n workflow includes HTTP Request nodes
   - Posts updates to `http://localhost:3001/stream/update`
   - Updates include: executionId, stage, status, message, data

5. **Streaming client receives and dispatches updates**
   - WebSocket/SSE connection receives updates
   - Matches update to execution subscription
   - Calls `onUpdate(update)` callback

6. **Workflow completes**
   - Final update with status "completed"
   - Calls `onComplete(result, executionId)`
   - Automatically unsubscribes

## Key Benefits

1. **Immediate Response**: Get execution IDs instantly, don't wait for completion
2. **Real-Time Progress**: See what's happening as workflow executes
3. **Better UX**: Show progress bars, status updates, loading states
4. **Multiple Workflows**: Track multiple executions simultaneously
5. **Backward Compatible**: Existing code continues to work without changes
6. **Graceful Degradation**: Falls back to polling if streaming server unavailable

## Usage Comparison

### Before (Polling)
```typescript
// Blocks until workflow completes (could be minutes)
const result = await callN8nWorkflow({
  webhookUrl: '...',
  waitForCompletion: true
});
console.log(result.data); // Only available after completion
```

### After (Streaming)
```typescript
// Returns immediately with execution ID
const result = await callN8nWorkflow({
  webhookUrl: '...',
  streaming: {
    onStart: (executionId) => {
      console.log('Started:', executionId); // Immediate!
    },
    onUpdate: (update) => {
      console.log('Progress:', update.message); // Real-time!
    },
    onComplete: (data) => {
      console.log('Done:', data); // When finished
    }
  }
});
console.log(result.executionId); // Available immediately!
```

## Files Modified

1. `lib/n8n-client/types.ts` - Added streaming types
2. `lib/n8n-client/streaming.ts` - NEW: Streaming client implementation
3. `lib/n8n-client/config.ts` - Added streaming configuration
4. `lib/n8n-client/webhook.ts` - Added streaming support
5. `lib/n8n-client/index.ts` - Export streaming functionality
6. `README.md` - Updated with streaming documentation

## Files Created

1. `lib/n8n-client/STREAMING_USAGE.md` - Comprehensive usage guide
2. `lib/n8n-client/EXAMPLE_STREAMING_INTEGRATION.ts` - Code examples
3. `lib/n8n-client/STREAMING_IMPLEMENTATION_SUMMARY.md` - This file

## Testing

To test the streaming functionality:

1. Start the streaming server:
   ```bash
   cd streaming-server
   node server.js
   ```

2. Configure your n8n workflow to send updates:
   - Add HTTP Request nodes at key stages
   - POST to `http://localhost:3001/stream/update`
   - Include executionId, stage, status, message

3. Call workflow with streaming callbacks:
   ```typescript
   const result = await callN8nWorkflow({
     webhookUrl: 'your-webhook-url',
     streaming: {
       onStart: (id) => console.log('Started:', id),
       onUpdate: (u) => console.log('Update:', u),
       onComplete: (r) => console.log('Done:', r),
       onError: (e) => console.error('Error:', e),
     }
   });
   ```

4. Watch the console for real-time updates!

## Next Steps

Potential enhancements:
- Add streaming support to React components in `components/assistant-ui/`
- Create a progress indicator component
- Add streaming to the chat interface
- Implement server-side streaming for AI responses
- Add metrics and monitoring for streaming connections
- Create a dashboard for tracking active executions

## Dependencies

The streaming client uses browser-native APIs:
- `WebSocket` for WebSocket connections
- `EventSource` for SSE connections
- No additional npm packages required

The streaming server requires:
- `express` - Web server
- `ws` - WebSocket server
- `cors` - CORS support

## Environment Variables

```bash
# Optional: Streaming server URL
N8N_STREAMING_SERVER_URL=http://localhost:3001

# Optional: Connection type (websocket or sse)
N8N_STREAMING_CONNECTION_TYPE=websocket
```

## Backward Compatibility

✅ All existing code continues to work without changes
✅ Streaming is opt-in via the `streaming` parameter
✅ Falls back to polling if streaming server unavailable
✅ No breaking changes to existing APIs

## Performance

- Single WebSocket/SSE connection shared across multiple executions
- Automatic reconnection with exponential backoff
- Efficient subscription management
- Minimal overhead when streaming not used

## Security Considerations

- Streaming server should be on same origin or CORS-enabled
- Consider authentication for production streaming server
- Execution IDs should be treated as sensitive data
- WebSocket connections should use WSS in production

## Troubleshooting

Common issues and solutions:

1. **No updates received**: Check streaming server is running and n8n workflow is sending updates
2. **Connection errors**: Verify `N8N_STREAMING_SERVER_URL` is correct
3. **Execution ID not found**: Ensure `N8N_API_KEY` is set for API lookup
4. **Multiple updates**: Normal - workflows can send many updates

See `STREAMING_USAGE.md` for detailed troubleshooting guide.

