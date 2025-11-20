/**
 * Real-time Streaming Server for n8n Workflow Updates
 * 
 * This server receives webhook updates from n8n workflows and streams them
 * to connected web clients via WebSocket or Server-Sent Events (SSE).
 * 
 * Usage:
 *   npm install express ws cors
 *   node server.js
 * 
 * The server will:
 * 1. Accept POST requests at /stream/update (from n8n webhooks)
 * 2. Broadcast updates to all connected WebSocket clients
 * 3. Serve SSE endpoint at /stream/sse/:executionId
 * 4. Serve a demo UI at http://localhost:3001
 */

const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Enable CORS for all routes
app.use(cors());
app.use(express.json());

// Store active WebSocket connections by executionId
const connections = new Map(); // executionId -> Set of WebSocket connections
const sseConnections = new Map(); // executionId -> Set of SSE response objects

// Store recent updates for new connections (last 100 updates per execution)
const updateHistory = new Map(); // executionId -> Array of updates

/**
 * WebSocket Server
 */
const wss = new WebSocket.Server({ server, path: '/stream/ws' });

wss.on('connection', (ws, req) => {
  console.log('New WebSocket connection');
  
  // Parse executionId from query string if provided
  const url = new URL(req.url, `http://${req.headers.host}`);
  const executionId = url.searchParams.get('executionId') || 'default';
  
  // Add to connections map
  if (!connections.has(executionId)) {
    connections.set(executionId, new Set());
  }
  connections.get(executionId).add(ws);
  
  // Send recent history if available
  if (updateHistory.has(executionId)) {
    const history = updateHistory.get(executionId);
    history.forEach(update => {
      ws.send(JSON.stringify(update));
    });
  }
  
  ws.on('close', () => {
    console.log('WebSocket connection closed');
    const execConnections = connections.get(executionId);
    if (execConnections) {
      execConnections.delete(ws);
      if (execConnections.size === 0) {
        connections.delete(executionId);
      }
    }
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
  
  // Send ping to keep connection alive
  ws.on('pong', () => {
    ws.isAlive = true;
  });
});

// Ping all connections every 30 seconds
const pingInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

/**
 * SSE Endpoint
 */
app.get('/stream/sse/:executionId?', (req, res) => {
  const executionId = req.params.executionId || 'default';
  
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // Add to SSE connections
  if (!sseConnections.has(executionId)) {
    sseConnections.set(executionId, new Set());
  }
  sseConnections.get(executionId).add(res);
  
  // Send recent history
  if (updateHistory.has(executionId)) {
    const history = updateHistory.get(executionId);
    history.forEach(update => {
      res.write(`data: ${JSON.stringify(update)}\n\n`);
    });
  }
  
  // Handle client disconnect
  req.on('close', () => {
    const execConnections = sseConnections.get(executionId);
    if (execConnections) {
      execConnections.delete(res);
      if (execConnections.size === 0) {
        sseConnections.delete(executionId);
      }
    }
  });
});

/**
 * Webhook endpoint - receives updates from n8n workflows
 */
app.post('/stream/update', (req, res) => {
  const update = {
    executionId: req.body.executionId || 'default',
    stage: req.body.stage || 'unknown',
    status: req.body.status || 'info',
    message: req.body.message || '',
    timestamp: req.body.timestamp || new Date().toISOString(),
    data: req.body.data || {}
  };
  
  console.log('Received update:', update);
  
  // Store in history (keep last 100)
  if (!updateHistory.has(update.executionId)) {
    updateHistory.set(update.executionId, []);
  }
  const history = updateHistory.get(update.executionId);
  history.push(update);
  if (history.length > 100) {
    history.shift();
  }
  
  // Broadcast to WebSocket connections
  const wsConnections = connections.get(update.executionId) || new Set();
  const defaultConnections = connections.get('default') || new Set();
  
  const allConnections = new Set([...wsConnections, ...defaultConnections]);
  allConnections.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(update));
    }
  });
  
  // Broadcast to SSE connections
  const sseExecConnections = sseConnections.get(update.executionId) || new Set();
  const sseDefaultConnections = sseConnections.get('default') || new Set();
  
  const allSSEConnections = new Set([...sseExecConnections, ...sseDefaultConnections]);
  allSSEConnections.forEach(res => {
    res.write(`data: ${JSON.stringify(update)}\n\n`);
  });
  
  res.json({ success: true, message: 'Update broadcasted' });
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    activeWebSocketConnections: Array.from(connections.values()).reduce((sum, set) => sum + set.size, 0),
    activeSSEConnections: Array.from(sseConnections.values()).reduce((sum, set) => sum + set.size, 0),
    trackedExecutions: updateHistory.size
  });
});

/**
 * Serve demo UI
 */
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>n8n Workflow Stream Monitor</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: #1a1a1a;
      color: #e0e0e0;
      padding: 20px;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    h1 {
      color: #ff6b6b;
      margin-bottom: 20px;
    }
    .controls {
      background: #2a2a2a;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
    }
    input, select, button {
      padding: 10px;
      margin: 5px;
      border: 1px solid #444;
      border-radius: 4px;
      background: #333;
      color: #e0e0e0;
    }
    button {
      background: #ff6b6b;
      border: none;
      cursor: pointer;
      font-weight: bold;
    }
    button:hover { background: #ff5252; }
    .status {
      padding: 10px;
      margin: 10px 0;
      border-radius: 4px;
      background: #2a2a2a;
    }
    .status.connected { background: #2d5a2d; }
    .status.disconnected { background: #5a2d2d; }
    .updates {
      background: #2a2a2a;
      padding: 20px;
      border-radius: 8px;
      max-height: 600px;
      overflow-y: auto;
    }
    .update {
      background: #333;
      padding: 15px;
      margin: 10px 0;
      border-radius: 4px;
      border-left: 4px solid #ff6b6b;
    }
    .update.success { border-left-color: #4caf50; }
    .update.error { border-left-color: #f44336; }
    .update.warning { border-left-color: #ff9800; }
    .update.info { border-left-color: #2196f3; }
    .update-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;
    }
    .stage { font-weight: bold; color: #ff6b6b; }
    .status-badge {
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: bold;
    }
    .status-badge.in_progress { background: #ff9800; color: #000; }
    .status-badge.completed { background: #4caf50; color: #000; }
    .status-badge.error { background: #f44336; color: #fff; }
    .timestamp { color: #888; font-size: 12px; }
    .message { margin-top: 8px; }
    .data { margin-top: 8px; padding: 8px; background: #1a1a1a; border-radius: 4px; font-family: monospace; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔴 n8n Workflow Stream Monitor</h1>
    
    <div class="controls">
      <label>Execution ID:</label>
      <input type="text" id="executionId" placeholder="default" value="default">
      <label>Connection Type:</label>
      <select id="connectionType">
        <option value="websocket">WebSocket</option>
        <option value="sse">Server-Sent Events (SSE)</option>
      </select>
      <button onclick="connect()">Connect</button>
      <button onclick="disconnect()">Disconnect</button>
      <button onclick="clearUpdates()">Clear</button>
    </div>
    
    <div id="status" class="status disconnected">Disconnected</div>
    
    <div class="updates" id="updates"></div>
  </div>

  <script>
    let ws = null;
    let eventSource = null;
    const updatesDiv = document.getElementById('updates');
    const statusDiv = document.getElementById('status');
    
    function addUpdate(update) {
      const updateEl = document.createElement('div');
      updateEl.className = \`update \${update.status}\`;
      
      const statusClass = update.status === 'completed' ? 'completed' : 
                          update.status === 'error' ? 'error' : 
                          update.status === 'in_progress' ? 'in_progress' : 'info';
      
      updateEl.innerHTML = \`
        <div class="update-header">
          <span class="stage">\${update.stage}</span>
          <span class="status-badge \${statusClass}">\${update.status}</span>
        </div>
        <div class="timestamp">\${new Date(update.timestamp).toLocaleString()}</div>
        <div class="message">\${update.message}</div>
        \${update.data && Object.keys(update.data).length > 0 ? 
          \`<div class="data">\${JSON.stringify(update.data, null, 2)}</div>\` : ''}
      \`;
      
      updatesDiv.insertBefore(updateEl, updatesDiv.firstChild);
    }
    
    function connect() {
      const executionId = document.getElementById('executionId').value || 'default';
      const connectionType = document.getElementById('connectionType').value;
      
      disconnect();
      
      if (connectionType === 'websocket') {
        ws = new WebSocket(\`ws://localhost:3001/stream/ws?executionId=\${executionId}\`);
        
        ws.onopen = () => {
          statusDiv.className = 'status connected';
          statusDiv.textContent = \`Connected (WebSocket) - Execution: \${executionId}\`;
        };
        
        ws.onmessage = (event) => {
          const update = JSON.parse(event.data);
          addUpdate(update);
        };
        
        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          statusDiv.className = 'status disconnected';
          statusDiv.textContent = 'Connection Error';
        };
        
        ws.onclose = () => {
          statusDiv.className = 'status disconnected';
          statusDiv.textContent = 'Disconnected';
        };
      } else {
        eventSource = new EventSource(\`http://localhost:3001/stream/sse/\${executionId}\`);
        
        eventSource.onopen = () => {
          statusDiv.className = 'status connected';
          statusDiv.textContent = \`Connected (SSE) - Execution: \${executionId}\`;
        };
        
        eventSource.onmessage = (event) => {
          const update = JSON.parse(event.data);
          addUpdate(update);
        };
        
        eventSource.onerror = (error) => {
          console.error('SSE error:', error);
          statusDiv.className = 'status disconnected';
          statusDiv.textContent = 'Connection Error';
        };
      }
    }
    
    function disconnect() {
      if (ws) {
        ws.close();
        ws = null;
      }
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      statusDiv.className = 'status disconnected';
      statusDiv.textContent = 'Disconnected';
    }
    
    function clearUpdates() {
      updatesDiv.innerHTML = '';
    }
    
    // Auto-connect on load
    window.addEventListener('load', () => {
      connect();
    });
  </script>
</body>
</html>
  `);
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`🚀 Streaming server running on http://localhost:${PORT}`);
  console.log(`📡 WebSocket endpoint: ws://localhost:${PORT}/stream/ws`);
  console.log(`📨 SSE endpoint: http://localhost:${PORT}/stream/sse/:executionId`);
  console.log(`🎣 Webhook endpoint: http://localhost:${PORT}/stream/update`);
  console.log(`💚 Health check: http://localhost:${PORT}/health`);
});

