# Example: Adding Streaming to Discord MCP Client Sequencer

This document shows exactly where and how to add streaming nodes to your workflows.

## Step 1: Import the Helper Workflow

First, import `[HELPERS] Stream Update Sender.json` into your n8n instance.

## Step 2: Add Streaming Nodes

Add "Execute Workflow" nodes at these key points in `Discord MCP Client Sequencer.json`:

### 1. After Context Enrichment Completes

**Location**: After "Enrich With Discord Context" node

**Node Configuration**:
```json
{
  "parameters": {
    "workflowId": {
      "__rl": true,
      "value": "STREAM_UPDATE_SENDER",
      "mode": "list",
      "cachedResultName": "[HELPERS] Stream Update Sender"
    },
    "workflowInputs": {
      "mappingMode": "defineBelow",
      "value": {
        "executionId": "={{ $execution.id }}",
        "stage": "context_enrichment",
        "status": "completed",
        "message": "Discord context enriched: {{ $json.context.discordContacts?.length || 0 }} contacts, {{ $json.context.serversOrGuilds?.length || 0 }} guilds",
        "data": {
          "contactsCount": "={{ $json.context.discordContacts?.length || 0 }}",
          "guildsCount": "={{ $json.context.serversOrGuilds?.length || 0 }}",
          "toolsCount": "={{ $json.context.toolRecommendations?.length || 0 }}"
        },
        "streamUrl": "http://localhost:3001/stream/update"
      }
    },
    "options": {}
  },
  "type": "n8n-nodes-base.executeWorkflow",
  "typeVersion": 1.3,
  "position": [0, -1200],
  "id": "stream-context-enriched",
  "name": "Stream: Context Enriched",
  "onError": "continueErrorOutput"
}
```

### 2. After Execution Plan Generated

**Location**: After "Has a direct answer?" switch node (on both outputs)

**For Direct Answer Path**:
```json
{
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
        "stage": "execution_planning",
        "status": "completed",
        "message": "Direct answer available: {{ $json.output.directAnswer?.substring(0, 100) }}...",
        "data": {
          "hasDirectAnswer": true,
          "answerLength": "={{ $json.output.directAnswer?.length || 0 }}"
        },
        "streamUrl": "http://localhost:3001/stream/update"
      }
    }
  },
  "type": "n8n-nodes-base.executeWorkflow",
  "typeVersion": 1.3,
  "position": [800, -1400],
  "id": "stream-direct-answer",
  "name": "Stream: Direct Answer",
  "onError": "continueErrorOutput"
}
```

**For Execution Steps Path**:
```json
{
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
        "stage": "execution_planning",
        "status": "completed",
        "message": "Execution plan generated: {{ $json.output.executionSteps?.length || 0 }} steps",
        "data": {
          "stepsCount": "={{ $json.output.executionSteps?.length || 0 }}",
          "steps": "={{ $json.output.executionSteps?.map(s => s.toolName) }}"
        },
        "streamUrl": "http://localhost:3001/stream/update"
      }
    }
  },
  "type": "n8n-nodes-base.executeWorkflow",
  "typeVersion": 1.3,
  "position": [1000, -1300],
  "id": "stream-execution-plan",
  "name": "Stream: Execution Plan",
  "onError": "continueErrorOutput"
}
```

### 3. In Step Executor Workflow

Modify `[HELPERS] Discord & Telegram Step Executor.json` to send updates for each step:

**After "Split Execution Steps"** - Send step count:
```json
{
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
        "stage": "step_execution",
        "status": "in_progress",
        "message": "Starting execution of {{ $('Split Execution Steps').all().length }} steps",
        "data": {
          "totalSteps": "={{ $('Split Execution Steps').all().length }}",
          "targetMcp": "={{ $json.targetMcp }}"
        },
        "streamUrl": "http://localhost:3001/stream/update"
      }
    }
  },
  "type": "n8n-nodes-base.executeWorkflow",
  "typeVersion": 1.3,
  "position": [-1000, 520],
  "id": "stream-step-start",
  "name": "Stream: Step Execution Start",
  "onError": "continueErrorOutput"
}
```

**After each step completes** (in the loop) - Add after "Format Step Results":
```json
{
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
        "stage": "step_execution",
        "status": "completed",
        "message": "Step completed: {{ $json.stepResult.toolName }}",
        "data": {
          "toolName": "={{ $json.stepResult.toolName }}",
          "callParams": "={{ $json.stepResult.callParams }}",
          "hasOutput": "={{ !!$json.stepResult.stepOutput }}"
        },
        "streamUrl": "http://localhost:3001/stream/update"
      }
    }
  },
  "type": "n8n-nodes-base.executeWorkflow",
  "typeVersion": 1.3,
  "position": [-300, 352],
  "id": "stream-step-complete",
  "name": "Stream: Step Complete",
  "onError": "continueErrorOutput"
}
```

### 4. After Validation

**Location**: After "Result Validator AI Agent" completes

```json
{
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
        "stage": "validation",
        "status": "={{ $json.output.shouldRetry ? 'error' : 'completed' }}",
        "message": "={{ $json.output.shouldRetry ? 'Validation failed, retrying...' : 'Validation successful' }}",
        "data": {
          "shouldRetry": "={{ $json.output.shouldRetry }}",
          "retryStrategy": "={{ $json.output.retryStrategy }}",
          "reasoning": "={{ $json.output.reasoning }}"
        },
        "streamUrl": "http://localhost:3001/stream/update"
      }
    }
  },
  "type": "n8n-nodes-base.executeWorkflow",
  "typeVersion": 1.3,
  "position": [1500, -1408],
  "id": "stream-validation",
  "name": "Stream: Validation",
  "onError": "continueErrorOutput"
}
```

### 5. On Retry

**Location**: In "Edit Fields" node path (retry loop)

```json
{
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
        "stage": "retry",
        "status": "in_progress",
        "message": "Retrying with refined approach: {{ $json.output.retryStrategy }}",
        "data": {
          "retryStrategy": "={{ $json.output.retryStrategy }}",
          "previousAttempt": "={{ $json.previousAttempt }}"
        },
        "streamUrl": "http://localhost:3001/stream/update"
      }
    }
  },
  "type": "n8n-nodes-base.executeWorkflow",
  "typeVersion": 1.3,
  "position": [2000, -1104],
  "id": "stream-retry",
  "name": "Stream: Retry",
  "onError": "continueErrorOutput"
}
```

## Connection Updates

After adding these nodes, update the connections in your workflow JSON:

1. Connect "Stream: Context Enriched" after "Enrich With Discord Context"
2. Connect "Stream: Direct Answer" and "Stream: Execution Plan" after "Has a direct answer?"
3. Connect "Stream: Step Execution Start" after "Split Execution Steps"
4. Connect "Stream: Step Complete" after "Format Step Results"
5. Connect "Stream: Validation" after "Result Validator AI Agent"
6. Connect "Stream: Retry" in the retry path

## Testing

1. Start the streaming server: `cd streaming-server && npm start`
2. Open the demo UI: `http://localhost:3001`
3. Execute your workflow from n8n
4. Watch real-time updates appear in the UI

## Environment Variables

For production, use environment variables:

```json
{
  "streamUrl": "={{ $env.STREAM_SERVER_URL || 'http://localhost:3001/stream/update' }}"
}
```

