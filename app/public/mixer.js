// Uses the verified application mapping; no hardware template is rewritten.
export function createMixer(mapping, ref) {
  const defaults = () => mapping.columns.map(() => ({...mapping.software_startup_normalized}));
  let values = defaults(), access, input, output, template = null, timer;
  let received = mapping.columns.map(() => []);
  const renderLEDs = () => {
    if (!output || output.state === 'disconnected') return;
    const anySolo = values.some(v => v.solo > 0.5);
    const pairs = values.flatMap((v, i) => [24 + i, !v.mute && (!anySolo || v.solo) ? 60 : 12, 32 + i, v.solo ? 63 : 12]);
    for (const slot of template === null ? Array.from({length: 16}, (_, i) => i) : [template]) {
      output.send([0xf0, 0, 0x20, 0x29, 2, 0x11, 0x78, slot, ...pairs, 0xf7]);
    }
  };
  const handler = ({data}) => {
    if (data.length === 9 && data[8] === 0xf7 && data[7] < 16 &&
        [0xf0, 0, 0x20, 0x29, 2, 0x11, 0x77].every((v, i) => data[i] === v)) {
      template = data[7]; renderLEDs(); return;
    }
    const [status, number, raw] = data;
    if ((status & 0xf0) !== 0xb0 || raw === undefined) return;
    mapping.columns.forEach((column, i) => Object.values(column.controls).forEach(control => {
      if (control.number !== number || control.channel !== (status & 15) + 1) return;
      const parameter = control.parameter;
      if (!received[i].includes(parameter)) received[i].push(parameter);
      if (['mute', 'solo'].includes(parameter)) {
        if (raw !== 0 && raw !== 127) return;
        values[i][parameter] = values[i][parameter] ? 0 : 1;
        setTimeout(renderLEDs, 20);
      } else values[i][parameter] = raw / 127;
    }));
  };
  const disconnect = () => {
    clearInterval(timer);
    input?.removeEventListener('midimessage', handler);
    if (access) access.onstatechange = null;
    input = output = null;
  };
  return {
    reset() { values = defaults(); received = mapping.columns.map(() => []); renderLEDs(); },
    snapshot() { return {values: values.map(v => ({...v})), received: received.map(v => [...v]),
      connected: input?.state === 'connected', ledConnected: output?.state === 'connected', template}; },
    set(column, parameter, value) {
      if (!Number.isInteger(column) || column < 1 || column > 8 ||
          !['volume', 'cutoff', 'resonance', 'reverb', 'mute', 'solo'].includes(parameter) ||
          !Number.isFinite(value) || value < 0 || value > 1) throw new Error('Invalid mixer control');
      values[column - 1][parameter] = ['mute', 'solo'].includes(parameter) ? Number(value >= 0.5) : value;
      received[column - 1] = received[column - 1].filter(p => p !== parameter);
      if(['mute','solo'].includes(parameter))renderLEDs();
    },
    disconnect,
    async connect(midiAccess = null) {
      disconnect();
      access = midiAccess || await navigator.requestMIDIAccess({sysex: true});
      const bind = () => {
        input?.removeEventListener('midimessage', handler);
        input = [...access.inputs.values()].find(p => p.name === mapping.input_name && p.state === 'connected');
        output = [...access.outputs.values()].find(p => p.name === mapping.led_feedback.output_name && p.state === 'connected');
        input?.addEventListener('midimessage', handler);
        renderLEDs();
      };
      bind();
      access.onstatechange = bind;
      if (!input) throw new Error('Launch Control XL is unavailable; audio can play without MIDI');
      timer = setInterval(renderLEDs, 1000);
      return output ? 'MIDI and LEDs connected' : 'MIDI connected; LED output unavailable';
    },
    strip(column, pattern) {
      const i = column - 1;
      const value = name => ref(() => values[i][name]);
      const audible = ref(() => !values[i].mute && (!values.some(v => v.solo) || values[i].solo) ? 1 : 0);
      return pattern.lpf(value('cutoff').range(100, 12000))
        .lpq(value('resonance').range(0.5, 5)).room(value('reverb').mul(0.6))
        .postgain(value('volume').mul(audible));
    },
  };
}
