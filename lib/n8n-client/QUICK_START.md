# Quick Start: Streaming n8n Client

Get up and running with streaming workflow updates in 5 minutes!

## Step 1: Start the Streaming Server (1 minute)

```bash
# In a separate terminal
cd streaming-server
npm install
node server.js
```

You should see:
```
🚀 Streaming server running on http://localhost:3001
📡 WebSocket endpoint: ws://localhost:3001/stream/ws
📨 SSE endpoint: http://localhost:3001/stream/sse/:executionId
🎣 Webhook endpoint: http://localhost:3001/stream/update
💚 Health check: http://localhost:3001/health
```

Visit `http://localhost:3001` to see the demo UI!

## Step 2: Configure Environment (30 seconds)

Add to your `.env.local`:

```bash
# Streaming server (already running on port 3001)
N8N_STREAMING_SERVER_URL=http://localhost:3001
N8N_STREAMING_CONNECTION_TYPE=websocket

# n8n API key (for execution tracking)
N8N_API_KEY=your-api-key-here
```

## Step 3: Update Your n8n Workflow (2 minutes)

Add HTTP Request nodes to send updates:

### At the start of your workflow:
```json
{
  "method": "POST",
  "url": "http://localhost:3001/stream/update",
  "body": {
    "executionId": "{{ $execution.id }}",
    "stage": "started",
    "status": "in_progress",
    "message": "Workflow execution started",
    "timestamp": "{{ $now }}"
  }
}
```

### During processing:
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

### At the end:
```json
{
  "method": "POST",
  "url": "http://localhost:3001/stream/update",
  "body": {
    "executionId": "{{ $execution.id }}",
    "stage": "completed",
    "status": "completed",
    "message": "Workflow completed successfully",
    "timestamp": "{{ $now }}",
    "data": {
      "result": "{{ $json }}"
    }
  }
}
```

## Step 4: Use Streaming in Your Code (1 minute)

```typescript
import { callN8nWorkflow } from '@/lib/n8n-client';

// Call workflow with streaming
const result = await callN8nWorkflow({
  webhookUrl: 'http://localhost:5678/webhook/your-workflow',
  method: 'POST',
  payload: { input: 'your data' },
  streaming: {
    onStart: (executionId, workflowId) => {
      console.log('🚀 Workflow started!');
      console.log('Execution ID:', executionId);
      console.log('Workflow ID:', workflowId);
    },
    onUpdate: (update) => {
      console.log('📡 Update:', update.stage);
      console.log('   Status:', update.status);
      console.log('   Message:', update.message);
      if (update.data) {
        console.log('   Data:', update.data);
      }
    },
    onComplete: (finalResult, executionId) => {
      console.log('✅ Workflow completed!');
      console.log('Execution ID:', executionId);
      console.log('Result:', finalResult);
    },
    onError: (error, executionId) => {
      console.error('❌ Workflow error:', error);
      if (executionId) {
        console.error('Execution ID:', executionId);
      }
    },
  },
});

// Result is returned immediately!
console.log('Immediate response:', result);
// {
//   success: true,
//   executionId: '12345',
//   workflowId: 'abc-def',
//   streaming: true
// }
```

## Step 5: Test It! (30 seconds)

1. Run your Next.js app: `npm run dev`
2. Trigger the workflow from your app
3. Watch the console for real-time updates!
4. Check the streaming server UI at `http://localhost:3001`

## That's It! 🎉

You now have real-time streaming workflow updates!

## What You Get

✅ **Immediate execution ID** - No waiting for workflow to complete
✅ **Real-time progress updates** - See what's happening as it happens
✅ **Better user experience** - Show progress, status, loading states
✅ **Multiple workflows** - Track many executions simultaneously
✅ **Automatic reconnection** - Resilient to network issues

## Next Steps

- Read `STREAMING_USAGE.md` for comprehensive examples
- Check `EXAMPLE_STREAMING_INTEGRATION.ts` for code patterns
- See `STREAMING_IMPLEMENTATION_SUMMARY.md` for technical details

## Troubleshooting

### No updates received?
- Check streaming server is running: `http://localhost:3001/health`
- Verify n8n workflow has HTTP Request nodes sending updates
- Check browser console for WebSocket connection errors

### Execution ID not found?
- Make sure `N8N_API_KEY` is set in `.env.local`
- Verify the webhook URL is correct
- Check n8n is running and accessible

### Connection issues?
- Verify `N8N_STREAMING_SERVER_URL` is correct
- Try switching to SSE: `N8N_STREAMING_CONNECTION_TYPE=sse`
- Check firewall/network settings

## Example: React Component

```typescript
import { useState } from 'react';
import { callN8nWorkflow, StreamUpdate } from '@/lib/n8n-client';

function MyComponent() {
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [updates, setUpdates] = useState<StreamUpdate[]>([]);
  const [result, setResult] = useState<any>(null);

  const runWorkflow = async () => {
    await callN8nWorkflow({
      webhookUrl: 'http://localhost:5678/webhook/my-workflow',
      method: 'POST',
      payload: { input: 'data' },
      streaming: {
        onStart: (id) => setExecutionId(id),
        onUpdate: (update) => setUpdates(prev => [...prev, update]),
        onComplete: (result) => setResult(result),
        onError: (error) => console.error(error),
      },
    });
  };

  return (
    <div>
      <button onClick={runWorkflow}>Run Workflow</button>
      {executionId && <p>Execution: {executionId}</p>}
      {updates.map((u, i) => (
        <div key={i}>{u.stage}: {u.message}</div>
      ))}
      {result && <pre>{JSON.stringify(result, null, 2)}</pre>}
    </div>
  );
}
```

## Support

For more help:
- See detailed documentation in `STREAMING_USAGE.md`
- Check example code in `EXAMPLE_STREAMING_INTEGRATION.ts`
- Review implementation details in `STREAMING_IMPLEMENTATION_SUMMARY.md`

