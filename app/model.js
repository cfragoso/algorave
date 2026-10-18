export const trackIds = ['kick', 'clap', 'closed_hats', 'percussion', 'bass', 'lead', 'chords', 'vocals'];

export function validateSong(song) {
  if (!song || typeof song.id !== 'string' || typeof song.name !== 'string' ||
      !Number.isFinite(song.bpm) || song.bpm < 40 || song.bpm > 250 ||
      !Array.isArray(song.tracks) || song.tracks.length !== 8) throw new Error('Invalid song');
  song.tracks.forEach((track, i) => {
    if (track.id !== trackIds[i] || track.column !== i + 1 ||
        typeof track.code !== 'string' || !track.code.trim() || track.code.length > 16000 ||
        typeof track.enabled !== 'boolean' ||
        !(track.sound === null || (typeof track.sound === 'string' && /^[\w:-]{1,64}$/.test(track.sound)))) {
      throw new Error('Invalid track: ' + trackIds[i]);
    }
  });
  return song;
}

export function patchTrack(song, id, patch) {
  if (!trackIds.includes(id)) throw new Error('Unknown track');
  if (!patch || Array.isArray(patch) || typeof patch !== 'object' ||
      !Object.keys(patch).length || Object.keys(patch).some(key => !['code', 'sound', 'enabled'].includes(key))) {
    throw new Error('Use code, sound and/or enabled');
  }
  const candidate = structuredClone(song);
  Object.assign(candidate.tracks.find(track => track.id === id), patch);
  return validateSong(candidate);
}
