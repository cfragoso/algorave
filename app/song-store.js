import {mkdir, readdir, readFile, writeFile, link, unlink} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {validateSong} from './model.js';
import {withSource, replaceSource} from './public/source.js';

export function createSongStore(directory) {
  return {
    async list() {
      let files;
      try { files = await readdir(directory); } catch (error) { if(error.code==='ENOENT') return []; throw error; }
      return Promise.all(files.filter(name => /^[a-z0-9][a-z0-9-]{0,95}\.json$/.test(name))
        .map(async name => validateSong(JSON.parse(await readFile(path.join(directory, name), 'utf8')))));
    },
    async save(input) {
      const song = withSource(validateSong(input));
      if (!/^[a-z0-9][a-z0-9-]{0,95}$/.test(song.id)) throw new Error('Song ID must use lowercase letters, numbers and hyphens (max 96 characters)');
      if (!song.name.trim() || song.name.length > 120) throw new Error('Song name must contain 1–120 characters');
      // Parse the full score and reconcile its labels with channel membership before saving.
      const checked = validateSong(replaceSource(song, song.code));
      await mkdir(directory, {recursive:true});
      const temporary = path.join(directory, '.' + randomUUID() + '.tmp');
      try {
        await writeFile(temporary, JSON.stringify(checked, null, 2) + '\n', {flag:'wx'});
        // Hard-link publishes a complete file atomically and refuses an existing ID.
        await link(temporary, path.join(directory, checked.id + '.json'));
      } finally { await unlink(temporary).catch(error => {if(error.code!=='ENOENT') throw error;}); }
      return checked;
    },
  };
}
