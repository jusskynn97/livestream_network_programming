const WebSocket = require('ws');
const http = require('http');
const url = require('url');

// Create HTTP server
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('WebSocket Emotion Server Running');
});

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Store active connections by stream_id
const streams = new Map();

wss.on('connection', (ws, req) => {
  const pathname = url.parse(req.url).pathname;
  const match = pathname.match(/\/stream\/([^\/]+)\/emotions/);
  
  if (!match) {
    ws.close(1008, 'Invalid URL format');
    return;
  }

  const streamId = match[1];
  
  // Add connection to stream room
  if (!streams.has(streamId)) {
    streams.set(streamId, new Set());
  }
  streams.get(streamId).add(ws);

  console.log(`Client connected to stream: ${streamId}`);
  console.log(`Active connections in stream ${streamId}: ${streams.get(streamId).size}`);

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'connection',
    message: 'Connected to emotion stream',
    stream_id: streamId
  }));

  // Handle incoming messages
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      if (message.type === 'emotion' && message.emoji && message.stream_id === streamId) {
        console.log(`Emotion received in stream ${streamId}: ${message.emoji} from user ${message.user_id}`);
        
        // Broadcast emotion to all clients in the same stream
        const streamClients = streams.get(streamId);
        if (streamClients) {
          streamClients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'emotion',
                emoji: message.emoji,
                user_id: message.user_id,
                stream_id: streamId,
                timestamp: Date.now()
              }));
            }
          });
        }
      }
    } catch (error) {
      console.error('Error processing message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format'
      }));
    }
  });

  // Handle connection close
  ws.on('close', () => {
    console.log(`Client disconnected from stream: ${streamId}`);
    
    const streamClients = streams.get(streamId);
    if (streamClients) {
      streamClients.delete(ws);
      
      // Clean up empty stream rooms
      if (streamClients.size === 0) {
        streams.delete(streamId);
        console.log(`Stream room ${streamId} closed (no clients)`);
      } else {
        console.log(`Active connections in stream ${streamId}: ${streamClients.size}`);
      }
    }
  });

  // Handle errors
  ws.on('error', (error) => {
    console.error(`WebSocket error in stream ${streamId}:`, error);
  });
});

// Heartbeat to keep connections alive
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      return ws.terminate();
    }
    
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => {
  clearInterval(heartbeatInterval);
});

// Start server
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`WebSocket Emotion Server running on port ${PORT}`);
  console.log(`Connect to: ws://localhost:${PORT}/stream/{stream_id}/emotions`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});