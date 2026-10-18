// Standalone strudel.cc version. Set USE_MIDI after evaluating the shared controller setup.
const USE_MIDI = false;
const anthemStrip = (column, pattern) => USE_MIDI ? globalThis.liveStrip(column, pattern) : pattern;
await samples({"nightvox":["numbers/1.wav","numbers/2.wav","numbers/3.wav","numbers/4.wav","yeah/000_Sound0.wav"]}, 'https://raw.githubusercontent.com/tidalcycles/Dirt-Samples/master/');

// MALTEGIANS ANTHEM · original deep house · 120 BPM · D minor
// 128 bars / about 4:16. Eight parts, one shared arrangement.
// Edit the roots and chord voicings together to change the harmony.
setcpm(120 / 4);

// Harbour 16 | pocket 16 | gathering 24 | dusk 16 | lift 8
// Anthem 32 | home 16. The complete journey loops.
function anthem(harbour, pocket, gathering, dusk, lift, chorus, home) {
  return arrange([16, harbour], [16, pocket], [24, gathering], [16, dusk],
    [8, lift], [32, chorus], [16, home]);
}
const roots = "<d2 d2 bb1 bb1 f2 f2 c2 c2>";
const voicings = "<[d3,f3,a3,c4,e4] [d3,f3,a3,c4,e4] [bb2,d3,f3,a3,c4] [bb2,d3,f3,a3,c4] [f3,a3,c4,e4,g4] [f3,a3,c4,e4,g4] [c3,e3,g3,bb3,d4] [c3,e3,g3,bb3,d4]>";

// 1 · Warm, steady kick. The dusk section makes room for the harmony.
const kick = s("bd*4").bank('tr909').gain(0.46);
const kickLift = arrange([6, silence], [2, kick.gain(0.30)]);
kick$: anthemStrip(1, anthem(kick, kick, kick, silence, kickLift, kick, kick));

// 2 · Soft clap with a quiet snare answering every fourth bar.
const clap = s("~ cp ~ cp").bank('tr909').gain(0.17);
const clapReply = stack(clap,
  s("<~ ~ ~ [~ ~ ~ sd]>").bank('tr909').gain(0.045));
clap$: anthemStrip(2, anthem(silence, clap, clapReply, silence,
  s("<sd*2 sd*2 sd*4 sd*8>/2").bank('tr909').gain(0.055), clapReply, clap));

// 3 · The shuffle is subtle: keep the first and third hats louder.
const hats = s("hh*8").bank('tr909').gain("0.065 0.03").swingBy(0.16, 4);
const hatsFull = s("hh*16").bank('tr909')
  .gain("0.065 0.018 0.038 0.025").swingBy(0.12, 8);
closed_hats$: anthemStrip(3, anthem(hats, hats, hats, silence, hats, hatsFull, hats));

// 4 · Offbeat open hats, rim clicks and a small tuned-percussion answer.
const openHat = s("[~ oh]*4").bank('tr909').gain(0.055).cut(4);
const rim = s("~ rim ~ ~ rim ~ ~ rim").bank('tr909')
  .gain(0.045).swingBy(0.14, 4);
const wood = note("~ a4 ~ ~ c5 ~ a4 ~").s('sine')
  .attack(0.001).decay(0.045).sustain(0).release(0.025).gain(0.025);
const percussion = stack(openHat, rim);
percussion$: anthemStrip(4, anthem(silence, percussion, stack(percussion, wood), rim,
  rim, stack(percussion, wood), openHat));

// 5 · Syncopated Dm9–Bbmaj9–Fmaj9–C9 bass, with a higher reply.
const bass = note(roots).struct("~ x ~ x ~ ~ x ~").s('triangle')
  .attack(0.006).decay(0.19).sustain(0.08).release(0.07).gain(0.19);
const bassReply = note("<a2 a2 f2 f2 c3 c3 g2 g2>")
  .struct("~ ~ ~ ~ ~ ~ ~ x").s('sine')
  .attack(0.004).decay(0.12).sustain(0).release(0.05).gain(0.045);
bass$: anthemStrip(5, anthem(silence, bass, stack(bass, bassReply), silence,
  bass.gain(0.10), stack(bass, bassReply), bass));

// 6 · An anthem that leaves space: a call, then a gentler response.
const call = note("a4 ~ c5 d5 ~ c5 ~ f4").slow(2).s('triangle')
  .attack(0.006).decay(0.24).sustain(0).release(0.20)
  .delay(0.18).delaytime(0.375).delayfeedback(0.26).gain(0.055);
const response = note("~ g4 ~ a4 c5 ~ a4 ~").slow(2).s('sine')
  .attack(0.012).decay(0.30).sustain(0).release(0.22).gain(0.045);
const melody = arrange([4, call], [4, response]);
lead$: anthemStrip(6, anthem(silence, silence, melody, response.gain(0.03), call,
  melody, silence));

// 7 · Soft electric-key-like stabs; sustained ninths during the breakdown.
const chords = note(voicings);
const keys = chords.struct("~ x ~ ~ x ~ x ~").s('triangle')
  .attack(0.009).decay(0.34).sustain(0).release(0.26).gain(0.032);
const pad = chords.s('sine').attack(0.45).decay(0.6)
  .sustain(0.40).release(1.0).room(0.35).gain(0.025);
chords$: anthemStrip(7, anthem(pad.gain(0.018), keys, keys, pad, pad,
  stack(keys, pad.gain(0.013)), keys.gain(0.02)));

// 8 · Chopped, pitched 'yeah' texture from the existing nightvox map.
// Replace this sample with your own spoken hook when you want real words.
const voice = s("~ nightvox:4 ~ ~").slow(4).speed(0.84)
  .begin(0.04).end(0.48).hpf(420).room(0.3).gain(0.065);
const echoVoice = s("~ ~ ~ nightvox:4").slow(8).speed(1.0)
  .begin(0.10).end(0.36).delay(0.22).delaytime(0.375)
  .delayfeedback(0.30).gain(0.045);
vocals$: anthemStrip(8, anthem(silence, silence, voice, echoVoice, silence,
  stack(voice, echoVoice), silence));

// LIVE: bring bass in after the intro; add melody after the groove settles.
// Lift the chord reverb in dusk. Restore kick + bass together for the anthem.
