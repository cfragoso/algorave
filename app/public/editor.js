import {EditorView, basicSetup} from 'codemirror';
import {Decoration} from '@codemirror/view';
import {StateEffect, StateField} from '@codemirror/state';
import {validRanges} from './activity.js';
import {javascript} from '@codemirror/lang-javascript';
import {HighlightStyle, syntaxHighlighting} from '@codemirror/language';
import {tags} from '@lezer/highlight';

export function createSongEditor({apply, report, storageKey='algorave-code-draft'}) {
  let current, baseRevision, dirty = false, submitted, restoring = false;
  let highlightKey = '';
  const setHighlights = StateEffect.define();
  const highlightField = StateField.define({
    create: () => Decoration.none,
    update(value, transaction) {
      if (transaction.docChanged) return Decoration.none;
      for (const effect of transaction.effects) if (effect.is(setHighlights)) return effect.value;
      return value;
    },
    provide: field => EditorView.decorations.from(field),
  });
  const note = document.getElementById('editor-status');
  const updateNote = () => {
    note.textContent = dirty
      ? (baseRevision !== current?.revision ? 'Draft kept — the live song changed remotely. Download your draft before using the current song.' : 'Unapplied draft · Ctrl/Cmd+Enter to update the whole song')
      : 'Showing the current shared song · Ctrl/Cmd+Enter to update';
    document.getElementById('evaluate').disabled = !current?.playerConnected || !!current?.pendingJob;
  };
  const view = new EditorView({
    parent: document.getElementById('song-editor'),
    extensions: [basicSetup, javascript(), EditorView.lineWrapping, highlightField,
      syntaxHighlighting(HighlightStyle.define([
        {tag: tags.keyword, color: '#c792ea'},
        {tag: tags.variableName, color: '#d7e4cf'},
        {tag: tags.definition(tags.variableName), color: '#82aaff'},
        {tag: tags.function(tags.variableName), color: '#82aaff'},
        {tag: tags.string, color: '#c3e88d'},
        {tag: tags.number, color: '#f6c177'},
        {tag: tags.comment, color: '#a2b991'},
        {tag: tags.operator, color: '#b4d6a4'},
      ])),
      EditorView.contentAttributes.of({'aria-label': 'Full Strudel song', spellcheck: 'false'}),
      EditorView.updateListener.of(update => {
        if (!update.docChanged) return;
        highlightKey = '';
        if (restoring) return;
        dirty = view.state.doc.toString() !== current?.song.code;
        sessionStorage.setItem(storageKey, JSON.stringify({code: view.state.doc.toString(), revision: baseRevision}));
        updateNote();
      }),
      EditorView.theme({
        '&': {backgroundColor: '#10150e', color: '#d7e4cf', fontSize: '15px'},
        '.cm-content': {fontFamily: 'ui-monospace, monospace', minHeight: '440px'},
        '.cm-gutters': {backgroundColor: '#181e16', color: '#99a696', border: 'none'},
        '.cm-activeLine, .cm-activeLineGutter': {backgroundColor: '#273321'},
        '.cm-cursor': {borderLeftColor: '#c6ef83'},
        '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {backgroundColor: '#3b5030'},
        '.cm-scroller': {maxHeight: '72vh', overflow: 'auto'},
      }, {dark: true}),
    ],
  });
  const setCode = code => {
    if (view.state.doc.toString() === code) return;
    restoring = true;
    view.dispatch({changes: {from: 0, to: view.state.doc.length, insert: code}});
    restoring = false;
  };
  const evaluate = async () => {
    if (document.getElementById('evaluate').disabled) return;
    submitted = view.state.doc.toString();
    try { await apply(submitted, baseRevision); }
    catch (error) { submitted = undefined; report(error); }
  };
  document.getElementById('evaluate').onclick = evaluate;
  view.dom.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); evaluate(); }
  });
  document.getElementById('use-current').onclick = () => {
    if (!current) return;
    setCode(current.song.code); dirty = false; baseRevision = current.revision; submitted = undefined;
    sessionStorage.removeItem(storageKey); updateNote();
  };
  document.getElementById('download-code').onclick = () => {
    const url = URL.createObjectURL(new Blob([view.state.doc.toString()], {type: 'text/javascript'}));
    const link = document.createElement('a'); link.href = url; link.download = (current?.song.id || 'algorave') + '-live.js';
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return {
    highlight(frame = {ranges: [], labels: []}) {
      const matching = !dirty && current && view.state.doc.toString() === current.song.code;
      const length = view.state.doc.length;
      const ranges = matching ? validRanges(frame.ranges, length) : [];
      const labels = matching ? validRanges(frame.labels, length) : [];
      const key = JSON.stringify([ranges, labels]);
      if (key === highlightKey) return;
      highlightKey = key;
      const marks = ranges.map(range => Decoration.mark({class: 'cm-playing-token'}).range(range.start, range.end))
        .concat(labels.map(range => Decoration.mark({class: 'cm-playing-part'}).range(range.start, range.end)));
      view.dispatch({effects: setHighlights.of(Decoration.set(marks, true))});
    },
    sync(next) {
      const initial = !current;
      current = next;
      if (initial) {
        try {
          const saved=sessionStorage.getItem(storageKey) || (storageKey==='algorave-code-draft-A'?sessionStorage.getItem('algorave-code-draft'):null);
          const draft = JSON.parse(saved);
          if(saved && storageKey==='algorave-code-draft-A'){sessionStorage.setItem(storageKey,saved);sessionStorage.removeItem('algorave-code-draft');}
          if (draft?.code && draft.code !== next.song.code) {
            setCode(draft.code); dirty = true; baseRevision = draft.revision;
          }
        } catch { /* An unavailable or old draft does not block the live song. */ }
      }
      if (submitted === next.song.code && view.state.doc.toString() !== submitted) {
        baseRevision = next.revision; submitted = undefined;
      }
      if (!dirty || (submitted === next.song.code && view.state.doc.toString() === submitted)) {
        setCode(next.song.code); baseRevision = next.revision; dirty = false; submitted = undefined;
        sessionStorage.removeItem(storageKey);
      }
      updateNote();
      if (!next.playback) this.highlight();
    },
    disconnected() {
      document.getElementById('evaluate').disabled = true;
      note.textContent = 'Disconnected · your draft is kept in this tab';
      this.highlight();
    },
  };
}
