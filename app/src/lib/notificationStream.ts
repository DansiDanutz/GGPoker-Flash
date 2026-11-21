// The server writes one JSON data line per event; comments are heartbeats.
export function subscribeNotifications(getToken: () => string | null, notify: (data: string) => void, retryMs = 5000) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  async function connect() {
    const token = getToken();
    if (!token || controller.signal.aborted) return;
    try {
      const response = await fetch('/api/notifications/stream', {
        headers: { authorization: `Bearer ${token}`, accept: 'text/event-stream' }, signal: controller.signal,
      });
      if (response.status === 401 || response.status === 403) return;
      if (!response.ok || !response.body) throw new Error('Notification stream unavailable');
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let pending = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done || controller.signal.aborted) break;
        pending += value;
        const frames = pending.split(/\r?\n\r?\n/);
        pending = frames.pop()!;
        for (const frame of frames) {
          const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^ /, ''));
          if (data.length) notify(data.join('\n'));
        }
      }
    } catch { /* transient network failure; retry unless the subscription ended */ }
    if (!controller.signal.aborted) timer = setTimeout(connect, retryMs);
  }
  void connect();
  return () => { controller.abort(); clearTimeout(timer); };
}
