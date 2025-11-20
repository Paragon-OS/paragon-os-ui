# n8n Real-Time Streaming Server

A real-time streaming server that receives webhook updates from n8n workflows and broadcasts them to connected web clients via WebSocket or Server-Sent Events (SSE).

## Features

- ✅ WebSocket support for bidirectional communication
- ✅ Server-Sent Events (SSE) for one-way streaming
- ✅ Execution ID filtering
- ✅ Update history (last 100 updates per execution)
- ✅ Demo UI included
- ✅ Health check endpoint
- ✅ CORS enabled
- ✅ Auto-reconnection support

## Quick Start

```bash
# Install dependencies
npm install

# Start the server
npm start

# Or use nodemon for development
npm run dev
```

The server will start on `http://localhost:3001` (or the PORT environment variable).

## Endpoints

- **WebSocket**: `ws://localhost:3001/stream/ws?executionId=<id>`
- **SSE**: `http://localhost:3001/stream/sse/<executionId>`
- **Webhook**: `POST http://localhost:3001/stream/update`
- **Health**: `GET http://localhost:3001/health`
- **Demo UI**: `http://localhost:3001`

## Webhook Payload Format

```json
{
  "executionId": "string",
  "stage": "string",
  "status": "in_progress" | "completed" | "error" | "info",
  "message": "string",
  "timestamp": "ISO8601",
  "data": {}
}
```

## Environment Variables

- `PORT` - Server port (default: 3001)

## Production Considerations

1. Add authentication/authorization
2. Use HTTPS/WSS
3. Implement Redis Pub/Sub for scaling
4. Add rate limiting
5. Configure proper CORS origins
6. Add logging and monitoring

## License

ISC

