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
```

### Setting Up Workflows

1. **Configure Workflow Webhooks**: Update `lib/n8n-config.ts` with your n8n workflow webhook paths or URLs:
   - `answerQuestion`: Webhook path for Q&A workflow using Telegram/Discord
   - `sendMessage`: Webhook path for sending messages (requires confirmation)
   - `generateTriage`: Webhook path for generating triages

2. **Workflow Webhook Paths**: In n8n, create webhook nodes and note their paths. For example:
   - If your webhook URL is `http://localhost:5678/webhook/answer-question`, use `/answer-question` as the `webhookPath`

3. **Confirmation Requirements**: Workflows that modify external state (like sending messages) are configured to require confirmation. You can adjust this in `lib/n8n-config.ts` by setting `requiresConfirmation: true/false`.

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
