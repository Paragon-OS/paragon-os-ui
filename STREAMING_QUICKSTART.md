# Streaming Quick Start Guide

Get real-time workflow monitoring up and running in 2 minutes!

## Step 1: Start the Next.js App (if not running)

```bash
npm run dev
```

The streaming server is built-in - no additional setup needed!

## Step 2: Open the Stream Monitor

1. Open your browser to `http://localhost:3000`
2. Click the **"Stream Monitor"** tab in the header
3. The monitor auto-connects and starts listening for updates

You should see: "Waiting for workflow updates..."

## Step 3: Test with curl

In a new terminal, send a test update:

```bash
curl -X POST http://localhost:3000/api/stream/update \
  -H "Content-Type: application/json" \
  -d '{
    "executionId": "test-123",
    "stage": "testing",
    "status": "in_progress",
    "message": "Hello from curl!",
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'",
    "data": {"test": true}
  }'
```

You should see the update appear instantly in the Stream Monitor! 🎉

## Step 4: Configure Your n8n Workflow

Add an HTTP Request node at the start of your workflow:

**Node Name:** Send Stream Update - Started

**Settings:**
- **Method:** POST
- **URL:** `http://localhost:3000/api/stream/update`
- **Send Body:** Yes
- **Body Content Type:** JSON

**Body:**
```json
{
  "executionId": "={{ $execution.id }}",
  "stage": "started",
  "status": "in_progress",
  "message": "Workflow execution started",
  "timestamp": "={{ $now.toISO() }}"
}
```

Add more HTTP Request nodes throughout your workflow for progress updates:

**Body for progress update:**
```json
{
  "executionId": "={{ $execution.id }}",
  "stage": "processing",
  "status": "in_progress",
  "message": "Processing data...",
  "timestamp": "={{ $now.toISO() }}",
  "data": {
    "progress": 50,
    "itemsProcessed": "={{ $json.itemCount }}"
  }
}
```

**Body for completion:**
```json
{
  "executionId": "={{ $execution.id }}",
  "stage": "completed",
  "status": "completed",
  "message": "Workflow completed successfully",
  "timestamp": "={{ $now.toISO() }}",
  "data": {
    "result": "={{ $json }}"
  }
}
```

## Step 5: Run Your Workflow

Trigger your n8n workflow and watch the updates flow in real-time in the Stream Monitor!

## What You'll See

The Stream Monitor displays:
- ✅ Execution ID (shortened)
- ✅ Stage name (e.g., "started", "processing", "completed")
- ✅ Status badge (color-coded: orange=in_progress, green=completed, red=error)
- ✅ Message
- ✅ Timestamp
- ✅ Data payload (if any)

## Troubleshooting

### No updates appearing?

1. **Check n8n workflow is running:**
   - Make sure n8n is accessible at `http://localhost:5678`
   - Trigger the workflow and check n8n's execution log

2. **Check the HTTP Request node URL:**
   - Should be `http://localhost:3000/api/stream/update`
   - NOT `http://localhost:3001` (that was the old external server)

3. **Check the Stream Monitor is connected:**
   - Should show green dot and "Connected"
   - If red, click "Connect" button

4. **Check browser console:**
   - Open DevTools (F12)
   - Look for `[stream-monitor]` logs
   - Look for SSE connection messages

### Still not working?

**Test the API manually:**

```bash
# Check health
curl http://localhost:3000/api/stream/health

# Subscribe to stream (leave this running)
curl -N http://localhost:3000/api/stream/sse/default

# In another terminal, send an update
curl -X POST http://localhost:3000/api/stream/update \
  -H "Content-Type: application/json" \
  -d '{"executionId":"test","stage":"test","status":"info","message":"test","timestamp":"2024-01-01T00:00:00Z"}'
```

You should see the update in the curl window immediately.

## Tips

### Filtering by Execution ID

The Stream Monitor connects to `/api/stream/sse/default` by default, which receives ALL updates.

To filter by specific execution ID, the component supports passing `executionIds` prop (for future customization).

### Multiple Tabs

Open multiple browser tabs - each gets its own SSE connection and receives updates independently!

### Clear Updates

Click the "Clear" button to remove all displayed updates (doesn't affect the server's history).

### Disconnect

Click "Disconnect" to close the SSE connection. Updates won't appear until you reconnect.

## Advanced Usage

### Programmatic Streaming

Use streaming callbacks in your code:

```typescript
import { callN8nWorkflow } from '@/lib/n8n-client';

const result = await callN8nWorkflow({
  webhookUrl: 'http://localhost:5678/webhook/your-workflow',
  method: 'POST',
  payload: { input: 'data' },
  streaming: {
    onStart: (executionId) => {
      console.log('Started:', executionId);
    },
    onUpdate: (update) => {
      console.log(`[${update.stage}] ${update.message}`);
    },
    onComplete: (result) => {
      console.log('Done!', result);
    },
    onError: (error) => {
      console.error('Error:', error);
    },
  },
});

// Returns immediately with execution ID
console.log(result.executionId);
```

### Status Values

- `in_progress` - Workflow is running (orange badge)
- `completed` - Workflow finished successfully (green badge)
- `error` - Workflow failed (red badge)
- `info` - Informational message (blue badge)

## That's It!

You now have real-time workflow monitoring! 🚀

For more details, see:
- `app/api/stream/README.md` - Complete API documentation
- `STREAMING_INTEGRATION_SUMMARY.md` - Technical overview
- `README.md` - General documentation

