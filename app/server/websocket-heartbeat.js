import { WebSocket } from 'ws';

export function startHeartbeat(wss, intervalMs = 30_000) {
  wss.on('connection', ws => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
  });
  const timer = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      // Terminate, rather than waiting for a close reply over the broken connection.
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      ws.ping();
    }
  }, intervalMs);
  timer.unref();
  const stop = () => clearInterval(timer);
  wss.once('close', stop);
  return stop;
}
