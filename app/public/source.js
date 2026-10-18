import {parse} from 'acorn';

export const trackIds = ['kick', 'clap', 'closed_hats', 'percussion', 'bass', 'lead', 'chords', 'vocals'];
const aliases = {hats: 'closed_hats', open: 'percussion', acid: 'lead'};
export const trackId = label => {
  const name = label.replace(/\$$/, '');
  return aliases[name] || name;
};

export function partsIn(code) {
  const ast = parse(code, {ecmaVersion: 2022, allowAwaitOutsideFunction: true});
  const parts = ast.body.filter(node => node.type === 'LabeledStatement' && node.body.type === 'ExpressionStatement')
    .map(node => ({id: trackId(node.label.name), label: node.label.name, start: node.start, end: node.end,
      expression: code.slice(node.body.expression.start, node.body.expression.end)}));
  const named = parts.filter(part => trackIds.includes(part.id)).map(part => part.id);
  if (new Set(named).size !== named.length) throw new Error('Each MIDI track may have only one active named part');
  return parts;
}

const expressionFor = track => track.sound ? `(${track.code}).s('${track.sound}')` : track.code;
const statementFor = track => `${track.id}$: ${expressionFor(track)};`;

export function withSource(song) {
  const candidate = structuredClone(song);
  if (typeof candidate.code !== 'string') {
    candidate.code = `// Edit the whole song. Ctrl/Cmd+Enter applies it.\nsetcpm(${candidate.bpm} / 4);\n\n` +
      candidate.tracks.map(track => track.enabled ? statementFor(track) : statementFor(track).split('\n').map(line => '// ' + line).join('\n')).join('\n\n');
  }
  return candidate;
}

export function replaceSource(song, code) {
  if (typeof code !== 'string' || !code.trim() || code.length > 64000) throw new Error('Code must contain 1–64000 characters');
  const parts = partsIn(code);
  const candidate = withSource(song);
  candidate.code = code;
  for (const track of candidate.tracks) {
    const part = parts.find(part => part.id === track.id);
    track.enabled = !!part;
    if (part) { track.code = part.expression; track.sound = null; }
  }
  return candidate;
}

export function rewriteTrack(song, track) {
  const part = partsIn(song.code).find(part => part.id === track.id);
  let statement = statementFor(track);
  if (!track.enabled) statement = statement.split('\n').map(line => '// ' + line).join('\n');
  song.code = part
    ? song.code.slice(0, part.start) + statement + song.code.slice(part.end)
    : song.code + '\n\n' + statement;
  return song;
}

// Capture top-level named patterns before the Strudel transpiler transforms labels.
export function captureSource(code) {
  let source = code;
  const parts = partsIn(code);
  if (!parts.length) {
    const last = parse(code, {ecmaVersion: 2022, allowAwaitOutsideFunction: true}).body.at(-1);
    if (last?.type === 'ExpressionStatement') {
      source = source.slice(0, last.start) + `__capture('$', (${code.slice(last.expression.start, last.expression.end)}));` + source.slice(last.end);
    }
  }
  for (const part of parts.reverse()) {
    source = source.slice(0, part.start) + `__capture('${part.label}', (${part.expression}));` + source.slice(part.end);
  }
  // Ensure definitions/comments alone form a valid, silent program.
  return source + '\n;silence;';
}
