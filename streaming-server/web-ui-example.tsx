/**
 * React Component Example for Real-Time n8n Workflow Updates
 * 
 * Usage:
 *   npm install react react-dom
 *   Use this component in your React app
 */

import React, { useEffect, useState, useRef } from 'react';

interface StreamUpdate {
  executionId: string;
  stage: string;
  status: 'in_progress' | 'completed' | 'error' | 'info';
  message: string;
  timestamp: string;
  data?: Record<string, any>;
}

interface WorkflowStreamProps {
  executionId?: string;
  streamUrl?: string;
  connectionType?: 'websocket' | 'sse';
}

export const WorkflowStream: React.FC<WorkflowStreamProps> = ({
  executionId = 'default',
  streamUrl = 'ws://localhost:3001/stream/ws',
  connectionType = 'websocket'
}) => {
  const [updates, setUpdates] = useState<StreamUpdate[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (connectionType === 'websocket') {
      // WebSocket connection
      const wsUrl = `${streamUrl}?executionId=${executionId}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        console.log('WebSocket connected');
      };

      ws.onmessage = (event) => {
        try {
          const update: StreamUpdate = JSON.parse(event.data);
          setUpdates(prev => [update, ...prev]);
        } catch (error) {
          console.error('Failed to parse update:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setIsConnected(false);
      };

      ws.onclose = () => {
        setIsConnected(false);
        console.log('WebSocket disconnected');
        // Attempt to reconnect after 3 seconds
        setTimeout(() => {
          if (wsRef.current?.readyState === WebSocket.CLOSED) {
            // Reconnect logic would go here
          }
        }, 3000);
      };

      return () => {
        ws.close();
        wsRef.current = null;
      };
    } else {
      // Server-Sent Events connection
      const sseUrl = streamUrl.replace('/stream/ws', `/stream/sse/${executionId}`);
      const eventSource = new EventSource(sseUrl);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        setIsConnected(true);
        console.log('SSE connected');
      };

      eventSource.onmessage = (event) => {
        try {
          const update: StreamUpdate = JSON.parse(event.data);
          setUpdates(prev => [update, ...prev]);
        } catch (error) {
          console.error('Failed to parse update:', error);
        }
      };

      eventSource.onerror = (error) => {
        console.error('SSE error:', error);
        setIsConnected(false);
      };

      return () => {
        eventSource.close();
        eventSourceRef.current = null;
      };
    }
  }, [executionId, streamUrl, connectionType]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return '#4caf50';
      case 'error': return '#f44336';
      case 'in_progress': return '#ff9800';
      default: return '#2196f3';
    }
  };

  const clearUpdates = () => {
    setUpdates([]);
  };

  return (
    <div style={{
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      padding: '20px',
      maxWidth: '1200px',
      margin: '0 auto'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px'
      }}>
        <h1 style={{ color: '#ff6b6b', margin: 0 }}>
          🔴 n8n Workflow Stream
        </h1>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <div style={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            backgroundColor: isConnected ? '#4caf50' : '#f44336',
            marginRight: '8px'
          }} />
          <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
          <button
            onClick={clearUpdates}
            style={{
              padding: '8px 16px',
              backgroundColor: '#666',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              marginLeft: '10px'
            }}
          >
            Clear
          </button>
        </div>
      </div>

      <div style={{
        backgroundColor: '#2a2a2a',
        borderRadius: '8px',
        padding: '20px',
        maxHeight: '600px',
        overflowY: 'auto'
      }}>
        {updates.length === 0 ? (
          <div style={{ color: '#888', textAlign: 'center', padding: '40px' }}>
            Waiting for updates...
          </div>
        ) : (
          updates.map((update, index) => (
            <div
              key={`${update.timestamp}-${index}`}
              style={{
                backgroundColor: '#333',
                padding: '15px',
                marginBottom: '10px',
                borderRadius: '4px',
                borderLeft: `4px solid ${getStatusColor(update.status)}`
              }}
            >
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '8px'
              }}>
                <span style={{
                  fontWeight: 'bold',
                  color: '#ff6b6b',
                  textTransform: 'uppercase',
                  fontSize: '12px'
                }}>
                  {update.stage}
                </span>
                <span style={{
                  padding: '4px 8px',
                  borderRadius: '4px',
                  backgroundColor: getStatusColor(update.status),
                  color: update.status === 'error' ? 'white' : 'black',
                  fontSize: '11px',
                  fontWeight: 'bold'
                }}>
                  {update.status}
                </span>
              </div>
              <div style={{
                color: '#888',
                fontSize: '12px',
                marginBottom: '8px'
              }}>
                {new Date(update.timestamp).toLocaleString()}
              </div>
              <div style={{ color: '#e0e0e0', marginBottom: '8px' }}>
                {update.message}
              </div>
              {update.data && Object.keys(update.data).length > 0 && (
                <div style={{
                  marginTop: '8px',
                  padding: '8px',
                  backgroundColor: '#1a1a1a',
                  borderRadius: '4px',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  color: '#aaa',
                  overflowX: 'auto'
                }}>
                  <pre style={{ margin: 0 }}>
                    {JSON.stringify(update.data, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// Usage example:
export const App: React.FC = () => {
  const [executionId, setExecutionId] = useState('default');
  const [connectionType, setConnectionType] = useState<'websocket' | 'sse'>('websocket');

  return (
    <div>
      <div style={{ padding: '20px', backgroundColor: '#1a1a1a' }}>
        <input
          type="text"
          value={executionId}
          onChange={(e) => setExecutionId(e.target.value)}
          placeholder="Execution ID"
          style={{
            padding: '8px',
            marginRight: '10px',
            backgroundColor: '#333',
            color: 'white',
            border: '1px solid #555',
            borderRadius: '4px'
          }}
        />
        <select
          value={connectionType}
          onChange={(e) => setConnectionType(e.target.value as 'websocket' | 'sse')}
          style={{
            padding: '8px',
            backgroundColor: '#333',
            color: 'white',
            border: '1px solid #555',
            borderRadius: '4px'
          }}
        >
          <option value="websocket">WebSocket</option>
          <option value="sse">Server-Sent Events</option>
        </select>
      </div>
      <WorkflowStream
        executionId={executionId}
        connectionType={connectionType}
      />
    </div>
  );
};

