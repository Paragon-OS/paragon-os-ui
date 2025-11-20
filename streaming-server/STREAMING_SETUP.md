# Real-Time Streaming Setup for n8n Workflows

This guide explains how to stream real-time updates from your n8n workflows to a web UI.

## Architecture

```
n8n Workflows → Webhook Nodes → Streaming Server → Web UI
                                      ↓
                              WebSocket/SSE
```

## Setup Steps

### 1. Install and Start the Streaming Server

```bash
cd streaming-server
npm install
npm start
```

The server will run on `http://localhost:3001` by default.

### 2. Add Streaming Nodes to Your Workflows

You need to add HTTP Request nodes at key points in your workflows to send updates. Here's how to modify your workflows:

#### Option A: Use the Helper Workflow (Recommended)

Add an "Execute Workflow" node that calls `[HELPERS] Stream Update Sender` at key points:

**Example for Discord MCP Client Sequencer:**

1. After "Enrich With Discord Context" completes
2. After "Execution Planner AI Agent" generates plan
3. After each step in "Call Discord Step Executor"
4. After "Result Validator AI Agent" completes

**Example node configuration:**

```json
{
  "type": "n8n-nodes-base.executeWorkflow",
  "parameters": {
    "workflowId": {
      "__rl": true,
      "value": "STREAM_UPDATE_SENDER",
      "mode": "list"
    },
    "workflowInputs": {
      "mappingMode": "defineBelow",
      "value": {
        "executionId": "={{ $execution.id }}",
        "stage": "context_enrichment",
        "status": "completed",
        "message": "Discord context enriched successfully",
        "data": {
          "contactsCount": "={{ $json.context.discordContacts?.length || 0 }}",
          "guildsCount": "={{ $json.context.serversOrGuilds?.length || 0 }}"
        },
        "streamUrl": "http://localhost:3001/stream/update"
      }
    }
  }
}
```

#### Option B: Direct HTTP Request Nodes

Add HTTP Request nodes directly:

```json
{
  "type": "n8n-nodes-base.httpRequest",
  "parameters": {
    "method": "POST",
    "url": "http://localhost:3001/stream/update",
    "sendBody": true,
    "bodyParameters": {
      "parameters": [
        {
          "name": "executionId",
          "value": "={{ $execution.id }}"
        },
        {
          "name": "stage",
          "value": "execution_planning"
        },
        {
          "name": "status",
          "value": "in_progress"
        },
        {
          "name": "message",
          "value": "Planning execution steps..."
        },
        {
          "name": "timestamp",
          "value": "={{ $now.toISO() }}"
        }
      ]
    },
    "options": {
      "timeout": 5000,
      "ignoreResponseCode": true
    }
  },
  "onError": "continueErrorOutput"
}
```

### 3. Connect Your Web UI

#### Option A: WebSocket Connection

```javascript
const executionId = 'your-execution-id'; // Use $execution.id from n8n
const ws = new WebSocket(`ws://localhost:3001/stream/ws?executionId=${executionId}`);

ws.onmessage = (event) => {
  const update = JSON.parse(event.data);
  console.log('Update received:', update);
  // Update your UI with the update
  // update.stage, update.status, update.message, update.data
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};
```

#### Option B: Server-Sent Events (SSE)

```javascript
const executionId = 'your-execution-id';
const eventSource = new EventSource(`http://localhost:3001/stream/sse/${executionId}`);

eventSource.onmessage = (event) => {
  const update = JSON.parse(event.data);
  console.log('Update received:', update);
  // Update your UI
};

eventSource.onerror = (error) => {
  console.error('SSE error:', error);
};
```

### 4. Update Format

Each update sent to the streaming server has this structure:

```json
{
  "executionId": "string",      // Unique execution identifier
  "stage": "string",             // Current stage (e.g., "context_enrichment", "execution_planning", "step_execution")
  "status": "string",            // Status: "in_progress", "completed", "error", "info"
  "message": "string",           // Human-readable message
  "timestamp": "ISO8601",        // Timestamp
  "data": {}                     // Additional data (optional)
}
```

### 5. Key Stages to Track

For your workflows, consider tracking these stages:

**Discord MCP Client Sequencer:**
- `context_enrichment` - When context enricher starts/completes
- `execution_planning` - When AI planner generates steps
- `step_execution` - When executing each MCP tool
- `validation` - When validator checks results
- `retry` - When retrying with refined approach

**Telegram MCP Client Sequencer:**
- Same stages as Discord sequencer

**Step Executor:**
- `step_start` - When a step begins
- `step_complete` - When a step completes
- `step_error` - When a step fails

## Demo UI

A demo UI is included at `http://localhost:3001` when you start the server. It shows:
- Connection status
- Real-time updates
- Execution ID filtering
- Both WebSocket and SSE support

## Production Considerations

1. **Authentication**: Add authentication to the streaming server endpoints
2. **HTTPS/WSS**: Use secure connections in production
3. **Scaling**: Consider using Redis Pub/Sub for multiple server instances
4. **Rate Limiting**: Add rate limiting to prevent abuse
5. **Error Handling**: Implement retry logic in your webhook nodes
6. **Environment Variables**: Use environment variables for URLs and ports

## Example: Adding Streaming to Discord MCP Client Sequencer

Here's where you should add streaming nodes:

1. **After "Enrich With Discord Context"** - Send context enrichment status
2. **After "Execution Planner AI Agent"** - Send planning status and step count
3. **In "Call Discord Step Executor" workflow** - Send updates for each step
4. **After "Result Validator AI Agent"** - Send validation results
5. **In retry loop** - Send retry attempts

## Troubleshooting

- **No updates received**: Check that the streaming server is running and accessible from n8n
- **Connection drops**: WebSocket connections may timeout; implement reconnection logic
- **Missing updates**: Ensure webhook nodes are set to `continueErrorOutput` so failures don't stop execution
- **Port conflicts**: Change PORT environment variable if 3001 is in use

## Next Steps

1. Start the streaming server
2. Add streaming nodes to your workflows
3. Test with the demo UI
4. Integrate into your production web UI

