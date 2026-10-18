export function summarizeAudio(samples, spectrum, sampleRate) {
  let peak = 0, sum = 0;
  for (const value of samples) { peak = Math.max(peak, Math.abs(value)); sum += value * value; }
  const bands = [0, 0, 0], counts = [0, 0, 0];
  spectrum.forEach((value, i) => {
    const hz = i * sampleRate / (spectrum.length * 2);
    if (hz < 20 || hz > 16000) return;
    const band = hz < 250 ? 0 : hz < 2000 ? 1 : 2;
    bands[band] += value / 255; counts[band]++;
  });
  return {peak, rms: Math.sqrt(sum / Math.max(1, samples.length)),
    bands: bands.map((value, i) => value / Math.max(1, counts[i])),
    wave: Array.from({length: 256}, (_, i) => samples[Math.floor(i * samples.length / 256)] || 0),
    windowMs: samples.length / sampleRate * 1000};
}

export function createAudioMonitor(context, getOutput) {
  const analyser = context.createAnalyser();
  analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.65;
  const samples = new Float32Array(analyser.fftSize), spectrum = new Uint8Array(analyser.frequencyBinCount);
  let source;
  return {
    capture() {
      const output = getOutput();
      if (output !== source) {
        if (source) { try { source.disconnect(analyser); } catch { /* The engine may have reset its output. */ } }
        source = output; source?.connect(analyser);
      }
      if (!source) return null;
      analyser.getFloatTimeDomainData(samples); analyser.getByteFrequencyData(spectrum);
      return summarizeAudio(samples, spectrum, context.sampleRate);
    },
    disconnect() { if (source) { try { source.disconnect(analyser); } catch {} } source = null; },
  };
}

export function normalizeTelemetry(input) {
  if (!input || !Number.isFinite(input.cycle) || input.cycle < 0 || input.cycle > 1e9 || !Number.isFinite(input.elapsed) || input.elapsed < 0 || input.elapsed > 1e9) return null;
  const normalized = {cycle: input.cycle, elapsed: input.elapsed, playing: input.playing === true};
  const audio = input.audio;
  if (audio && Number.isFinite(audio.peak) && Number.isFinite(audio.rms) && audio.peak >= 0 && audio.peak <= 8 && audio.rms >= 0 && audio.rms <= 8 &&
      Array.isArray(audio.wave) && audio.wave.length === 256 && audio.wave.every(n => Number.isFinite(n) && Math.abs(n) <= 8) &&
      Array.isArray(audio.bands) && audio.bands.length === 3 && audio.bands.every(n => Number.isFinite(n) && n >= 0 && n <= 1)) {
    normalized.audio = {peak: audio.peak, rms: audio.rms, wave: audio.wave, bands: audio.bands,
      windowMs: Number.isFinite(audio.windowMs) ? Math.max(1, Math.min(1000, audio.windowMs)) : 43};
  }
  const mix = input.mixer;
  const parameters = ['volume', 'cutoff', 'resonance', 'reverb', 'mute', 'solo'];
  if (mix && Array.isArray(mix.values) && mix.values.length === 8 && mix.values.every(v => v && parameters.every(p => Number.isFinite(v[p]) && v[p] >= 0 && v[p] <= 1))) {
    normalized.mixer = {connected: mix.connected === true, ledConnected: mix.ledConnected === true,
      values: mix.values.map(v => Object.fromEntries(parameters.map(p => [p, v[p]]))),
      received: Array.from({length: 8}, (_, i) => Array.isArray(mix.received?.[i]) ? parameters.filter(p => mix.received[i].includes(p)) : [])};
  }
  normalized.tracks = (Array.isArray(input.tracks) ? input.tracks : []).filter(v => typeof v === 'string' && v.length <= 24).slice(0, 8);
  return normalized;
}
