export function createActivityClock() {
  let events = [];
  return {
    clear() { events = []; },
    schedule(hap, time, duration) {
      if (!Number.isFinite(time) || !Number.isFinite(duration) ||
          Number(hap.value?.postgain ?? 1) <= 0 || Number(hap.value?.gain ?? 1) <= 0) return;
      const context = hap.context || {};
      events.push({time, end: time + Math.max(0.07, duration), source: context.algoraveSource,
        ranges: context.locations || [], label: context.algoraveLabel, track: context.algoraveTrack});
      if (events.length > 4096) events = events.slice(-4096);
    },
    frame(time, source) {
      events = events.filter(event => event.end > time && event.source === source);
      const active = events.filter(event => event.time <= time);
      return {ranges: validRanges(active.flatMap(event => event.ranges), source.length),
        labels: validRanges(active.map(event => event.label), source.length),
        tracks: [...new Set(active.map(event => event.track).filter(Boolean))].slice(0, 8)};
    },
  };
}

export function validRanges(ranges, length) {
  const seen = new Set();
  return (Array.isArray(ranges) ? ranges : []).filter(range => {
    if (!range || !Number.isInteger(range.start) || !Number.isInteger(range.end) ||
        range.start < 0 || range.end <= range.start || range.end > length) return false;
    const key = range.start + ':' + range.end;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, 256);
}
