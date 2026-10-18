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

// One bar per second, at about 12.5% red. Complete circuit: eight seconds.
setcps(0.5)
$: n("1 2 3 4 5 6 7 8").slow(4)
  .onTrigger((hap, currentTime, cps, targetTime) => {
    if (connection.socket.readyState !== WebSocket.OPEN) return;
    connection.socket.send(JSON.stringify({
      type: 'bar',
      bar: Number(hap.value.n),
      rgb: [32, 0, 0],
      exclusive: true,
      executeAt: performance.now() / 1000 + connection.offset + Math.max(0, targetTime - currentTime)
    }));
  })

// Stopping Strudel causes blackout after two seconds without lighting events.
// To blackout immediately, stop the pattern and evaluate:
// garageLights.socket.send(JSON.stringify({type: 'blackout'}))
