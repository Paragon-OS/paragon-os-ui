This is the ParagonOS UI project, built on top of the [assistant-ui](https://github.com/Yonom/assistant-ui) starter template.

## Getting Started

First, add your API key(s) to `.env.local`:

```
# Gemini (default)
GOOGLE_GENERATIVE_AI_API_KEY=your-gemini-api-key

# Optional: keep OpenAI support by wiring your key as well
# OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

By default the chat endpoint uses Gemini `models/gemini-2.5-flash`. You can switch
to another Google model (for example, `models/gemini-1.5-pro`) by updating
`app/api/chat/route.ts`.

## n8n Workflow Integration

This project includes integration with locally running n8n workflows, allowing the AI assistant to call workflows for answering questions, generating triages, and sending messages.

### Configuration

Add n8n configuration to your `.env.local`:

```
# n8n Configuration
N8N_BASE_URL=http://localhost:5678
N8N_WEBHOOK_BASE_URL=http://localhost:5678/webhook
# Optional: API key for n8n API authentication
# N8N_API_KEY=your-n8n-api-key

# Optional: Synchronous execution settings
# N8N_WAIT_FOR_COMPLETION=true  # Wait for workflow completion (default: true)
# N8N_POLL_INTERVAL=500         # Polling interval in ms (default: 500ms)

# Optional: Streaming server configuration (for real-time workflow updates)
# N8N_STREAMING_SERVER_URL=http://localhost:3001
# N8N_STREAMING_CONNECTION_TYPE=websocket  # 'websocket' or 'sse' (default: websocket)
```

### Setting Up Workflows

1. **Configure Workflow Webhooks**: Update `lib/n8n-config.ts` with your n8n workflow webhook paths or URLs:
   - `answerQuestion`: Webhook path for Q&A workflow using Telegram/Discord
   - `sendMessage`: Webhook path for sending messages (requires confirmation)
   - `generateTriage`: Webhook path for generating triages

2. **Workflow Webhook Paths**: In n8n, create webhook nodes and note their paths. For example:
   - If your webhook URL is `http://localhost:5678/webhook/answer-question`, use `/answer-question` as the `webhookPath`

3. **Confirmation Requirements**: Workflows that modify external state (like sending messages) are configured to require confirmation. You can adjust this in `lib/n8n-config.ts` by setting `requiresConfirmation: true/false`.

4. **Synchronous Execution**: By default, the system waits for workflows to complete before returning results. If your n8n webhook is configured for asynchronous execution ("Response Mode: Immediately"), the system will automatically poll the execution API until completion. You can disable this behavior by setting `N8N_WAIT_FOR_COMPLETION=false` in your `.env.local`.

### Available Tools

The AI assistant has access to the following n8n workflow tools:

- **answerQuestion**: Answer questions using personal Telegram & Discord chat history
- **sendMessage**: Send messages via Telegram or Discord (requires confirmation)
- **generateTriage**: Generate triages from context
- **callN8nWorkflow**: Generic tool to call any n8n workflow via webhook URL

### Usage

Once configured, you can ask the AI assistant to:
- "Answer this question using my chat history: [your question]"
- "Send a message to [recipient] on Telegram: [message]"
- "Generate a triage for: [context]"

The assistant will automatically call the appropriate n8n workflows and display the results in the chat interface.

### Real-Time Streaming Updates (NEW)

The n8n client now supports real-time streaming updates, allowing you to get immediate execution IDs and receive progress updates as workflows execute.

#### Features

- **Immediate Response**: Get workflow ID and execution ID as soon as the workflow starts
- **Real-Time Updates**: Receive progress updates while the workflow is running
- **Callback-Based**: Use callbacks to handle start, update, complete, and error events
- **Multiple Executions**: Track multiple concurrent workflow executions simultaneously

#### Setup

1. **Start the Streaming Server**: Run the streaming server (requires Node.js):
   ```bash
   cd streaming-server
   npm install
   node server.js
   ```
   The server will start on `http://localhost:3001`

2. **Configure n8n Workflows**: Add HTTP Request nodes in your n8n workflows to send updates:
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
       "data": { "progress": 50 }
     }
   }
   ```

3. **Use Streaming in Your Code**:
   ```typescript
   import { callN8nWorkflow } from '@/lib/n8n-client';

   const result = await callN8nWorkflow({
     webhookUrl: 'http://localhost:5678/webhook/my-workflow',
     method: 'POST',
     payload: { input: 'data' },
     streaming: {
       onStart: (executionId, workflowId) => {
         console.log('Started:', executionId);
       },
       onUpdate: (update) => {
         console.log('Update:', update.stage, update.message);
       },
       onComplete: (result, executionId) => {
         console.log('Completed:', result);
       },
       onError: (error) => {
         console.error('Error:', error);
       },
     },
   });

   // Result returned immediately with execution IDs
   console.log('Execution ID:', result.executionId);
   ```

#### Documentation

- **Usage Guide**: See `lib/n8n-client/STREAMING_USAGE.md` for comprehensive examples
- **Integration Examples**: See `lib/n8n-client/EXAMPLE_STREAMING_INTEGRATION.ts` for code samples
- **Demo Server**: The streaming server includes a demo UI at `http://localhost:3001`

## Development

Run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.
