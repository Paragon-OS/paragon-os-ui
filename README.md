This is the ParagonOS UI project, built on top of the [assistant-ui](https://github.com/Yonom/assistant-ui) starter template.

## Getting Started

First, add your API key(s) to `.env.local`:

```
# Gemini (default)
GOOGLE_GENERATIVE_AI_API_KEY=your-gemini-api-key

# Optional: keep OpenAI support by wiring your key as well
# OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

By default the chat endpoint uses Gemini `models/gemini-1.5-flash`. You can switch
to another Google model (for example, `models/gemini-1.5-pro`) by updating
`app/api/chat/route.ts`.

Then, run the development server:

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
