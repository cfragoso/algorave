// SOUTH AFRICAN AWAKENING
// Original deep house sketch · 122 BPM · F# minor · 128 bars / about 4:12.
// App score: MIDI and sample loading are handled by the shared player.
// Edit one definition, then Ctrl/Cmd+Enter. Keep the named parts for MIDI/API.
setcpm(122 / 4);

// Dawn 8 | settle 16 | awakening 24 | breathe 16 | lift 8
// Sunlight 32 | afterglow 16 | horizon 8. The complete arrangement loops.
function journey(dawn, settle, awakening, breathe, lift, sunlight, afterglow, horizon) {
  return arrange(
    [8, dawn], [16, settle], [24, awakening], [16, breathe],
    [8, lift], [32, sunlight], [16, afterglow], [8, horizon],
  );
}

// Shared eight-bar harmony: F#m9 → Dmaj9 → Amaj9 → E6/9.
const harmony = note("<[f#3,a3,c#4,e4,g#4] [d3,f#3,a3,c#4,e4] [a2,c#3,e3,g#3,b3] [e3,g#3,b3,c#4,f#4]>").slow(2);
const roots = "<f#2 f#2 d2 d2 a1 a1 e2 e2>";

// 1 KICK — unhurried, rounded four-on-the-floor.
const kick = s("bd*4").bank('tr909').gain(0.48);
const dawnKick = arrange([4, silence], [4, kick.gain(0.32)]);
const kickLift = arrange([6, kick], [2, silence]);
kick$: journey(dawnKick, kick, kick, silence, kickLift, kick, kick, silence);

// 2 CLAP — light backbeat; sparse ghost snare gives the peak some motion.
const clap = s("~ cp ~ cp").bank('tr909').gain(0.16);
const clapGhost = stack(clap,
  s("<~ ~ ~ [~ ~ ~ sd]>").bank('tr909').gain(0.045),
);
clap$: journey(silence, clap, clapGhost, silence, clap, clapGhost, clap, silence);

// 3 CLOSED HATS — shuffled eighths, then quiet sixteenth-note accents.
const hats = s("hh*8").bank('tr909').gain("0.065 0.035").swingBy(0.18, 4);
const hatsLift = s("hh*16").bank('tr909')
  .gain("0.065 0.022 0.042 0.025").swingBy(0.14, 8);
hats$: journey(hats.gain(0.025), hats, hats, silence, hatsLift, hatsLift, hats, hats.gain(0.02));

// 4 PERCUSSION — a five-hit rim cycle against open hats and low tuned pulses.
const rim = s("rim(5,8)").bank('tr909').gain("0.07 0.04 0.055").swingBy(0.12, 4);
const open = s("~ oh ~ oh ~ oh ~ oh").bank('tr909').gain(0.055).cut(4);
const pulse = note("~ c#3 ~ ~ e3 ~ c#3 ~").s('sine')
  .attack(0.002).decay(0.065).sustain(0).release(0.03).gain(0.045);
const percussion = stack(rim, open);
const percussionPeak = stack(percussion, pulse);
percussion$: journey(rim.gain(0.025), percussion, percussionPeak,
  rim.gain(0.03), rim, percussionPeak, percussion, silence);

// 5 BASS — syncopated roots follow the chords; triangle keeps some audibility
// on small speakers. Change the rhythm string to reshape the pocket.
const bass = note(roots).struct("~ x ~ x ~ ~ x x").s('triangle')
  .attack(0.008).decay(0.18).sustain(0.15).release(0.08).gain(0.17);
const bassPeak = stack(
  bass,
  note("<c#3 c#3 a2 a2 e2 e2 b2 b2>").struct("~ ~ ~ ~ ~ ~ ~ x")
    .s('sine').decay(0.11).sustain(0).release(0.05).gain(0.045),
);
bass$: journey(silence, bass, bassPeak, silence, bass.gain(0.10), bassPeak, bass, silence);

// 6 LEAD — a soft mallet-like phrase; spaces are part of the melody.
const motif = note("c#5 ~ b4 a4 ~ g#4 ~ e4").slow(2).s('triangle')
  .attack(0.003).decay(0.20).sustain(0).release(0.15)
  .delay(0.16).delaytime(60 / 122 * 0.75).delayfeedback(0.25).gain(0.06);
const answer = note("~ e5 ~ c#5 b4 ~ g#4 ~").slow(2).s('sine')
  .attack(0.01).decay(0.32).sustain(0).release(0.25).gain(0.045);
const conversation = arrange([4, motif], [4, answer]);
lead$: journey(silence, silence, conversation, answer.gain(0.025),
  motif, conversation, motif, silence);

// 7 CHORDS — warm ninths: sustained dawn/breakdown, syncopated main groove.
const pad = harmony.s('triangle').attack(0.55).decay(0.6)
  .sustain(0.35).release(1.5).gain(0.025);
const keys = harmony.struct("~ x ~ ~ x ~ x ~").s('triangle')
  .attack(0.008).decay(0.38).sustain(0).release(0.28).gain(0.035);
chords$: journey(pad, keys, keys, pad, pad, keys, keys, pad.gain(0.018));

// 8 VOCAL TEXTURE — sparse, pitched/chopped 'yeah', not a sung verse.
// Uses the existing nightvox map; substitute your own recorded vocal later.
const breath = s("~ nightvox:4 ~ ~").slow(8).speed(0.78)
  .begin(0.02).end(0.45).hpf(450).gain(0.075)
  .delay(0.25).delaytime(60 / 122 * 0.75).delayfeedback(0.32);
const vocalReply = s("~ ~ nightvox:4 ~").slow(4).speed("<0.78 0.88>")
  .begin(0.12).end(0.55).hpf(500).gain(0.06);
vocals$: journey(silence, silence, breath, breath,
  silence, stack(breath, vocalReply), breath, silence);

// LIVE: start with kick + hats + chords; add bass, percussion, then melody.
// During 'breathe', bring up the chord/lead reverb gently with the bottom knobs.
// For a larger return, mute kick + bass, wait eight bars, then release both.
// To change the harmony, edit harmony AND roots together.
