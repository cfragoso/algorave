// Paste into Strudel in Chrome. Allow local-network access if requested.
// The bridge must be running on this computer at ws://127.0.0.1:8765.
// Re-evaluation reuses the connection; no independent chase timer is used.
if (globalThis.garageLights?.socket.readyState !== WebSocket.OPEN) {
  const socket = new WebSocket('ws://127.0.0.1:8765');
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', event => {
    const response = JSON.parse(event.data);
    if (response.type === 'error') console.error('Lighting bridge:', response.message);
  });
  globalThis.garageLights = { socket, offset: 0 };
}

// Estimate the bridge's monotonic clock using the lowest round-trip sample.
const connection = globalThis.garageLights;
let bestRtt = Infinity;
for (let i = 0; i < 5; i++) {
  const id = 'clock-' + i;
  const sent = performance.now() / 1000;
  const reply = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { connection.socket.removeEventListener('message', receive); reject(new Error('Lighting clock timed out')); }, 2000);
    function receive(event) {
      const message = JSON.parse(event.data);
      if (message.type === 'pong' && message.id === id) {
        clearTimeout(timer);
        connection.socket.removeEventListener('message', receive);
        resolve(message);
      }
    }
    connection.socket.addEventListener('message', receive);
    connection.socket.send(JSON.stringify({ type: 'ping', id }));
  });
  const received = performance.now() / 1000;
  if (received - sent < bestRtt) {
    bestRtt = received - sent;
    connection.offset = reply.serverTime - (sent + received) / 2;
  }
}

// Clear old queued events and claim this connection when starting a new test.
connection.socket.send(JSON.stringify({ type: 'blackout' }));

// Four beats per cycle: 120 BPM. Each kick drives sound AND all eight bars.
setcpm(120 / 4)

// Positive values delay the lights; negative values advance them.
const lightOffsetMs = 0;
const pulseLength = 0.18; // seconds; keep shorter than the interval between kicks

$: s("bd*4").gain("0.8 0.5 0.65 0.5")
  .onTrigger((hap, currentTime, cps, targetTime) => {
    if (connection.socket.readyState !== WebSocket.OPEN) return;
    const at = performance.now() / 1000 + connection.offset
      + Math.max(0, targetTime - currentTime) + lightOffsetMs / 1000;
    const peak = Math.round(32 * Math.max(0, Math.min(1, Number(hap.value.gain ?? 1))));
    // Schedule a short decay on the bridge, rather than browser timers.
    for (let step = 0; step <= 5; step++) {
      const level = Math.round(peak * (1 - step / 5));
      for (let bar = 1; bar <= 8; bar++) {
        connection.socket.send(JSON.stringify({
          type: 'bar', bar, rgb: [level, 0, 0], exclusive: false,
          executeAt: at + pulseLength * step / 5
        }));
      }
    }
  }, false) // false preserves Strudel's audio output

// Add other musical parts below. Attach this callback only to the beat source.
// Stopping Strudel stops new pulses; the final pulse ends at zero.
// Very dense or overlapping kicks need envelopes inside the lighting service.
