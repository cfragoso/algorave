// GERMAN RENAISSANCE · original trance · 140 BPM · E minor
// 144 bars / about 4:07. The whole arrangement loops.
// Eight named parts keep the same Launch Control XL columns.
setcpm(140 / 4);

// Intro 16 | drive 16 | flight 32 | cathedral 16 | rise 16 | return 32 | dawn 16
function renaissance(intro, drive, flight, cathedral, rise, drop, dawn) {
  return arrange([16, intro], [16, drive], [32, flight], [16, cathedral],
    [16, rise], [32, drop], [16, dawn]);
}

// 1 · A steady foundation. Remove the kick to make the return feel enormous.
const kick = s("bd*4").bank('tr909').gain(0.55);
kick$: renaissance(kick, kick, kick, silence, silence, kick, kick);

// 2 · Backbeat clap; the final two build bars tighten into a snare roll.
const clap = s("~ cp ~ cp").bank('tr909').gain(0.20);
const snareRise = arrange([8, silence], [4, s("sd*4")], [2, s("sd*8")],
  [1, s("sd*16")], [1, s("sd*32")]).bank('tr909').gain(0.08);
clap$: renaissance(silence, clap, clap, silence, snareRise, clap, clap.gain(0.10));

// 3 · Driving sixteenths, with space on the downbeats.
const hats = s("[~ hh hh hh]*4").bank('tr909').gain("0.07 0.04 0.06");
closed_hats$: renaissance(hats.gain(0.025), hats, hats, silence,
  hats.gain(0.035), hats, hats.gain(0.035));

// 4 · Open hats and a restrained rim pattern.
const percussion = stack(
  s("[~ oh]*4").bank('tr909').gain(0.08).cut(4),
  s("~ rim ~ ~ ~ ~ rim ~").bank('tr909').gain(0.055)
);
percussion$: renaissance(silence, percussion, percussion, silence, silence,
  percussion, percussion.gain(0.04));

// 5 · E–C–G–D roots. The three offbeat notes leave room for the kick.
const bass = note("<e2 c2 g1 d2>/4").s('sawtooth')
  .struct("[~ x x x]*4").attack(0.003).decay(0.10).sustain(0)
  .release(0.025).lpf(800).gain(0.17);
bass$: renaissance(silence, bass, bass, silence, silence, bass, bass);

// 6 · Change this motif to make the lead your own.
const melody = "e4 b4 g4 b4 e5 b4 g4 b4 c5 g4 e4 g4 c5 g4 e4 g4";
const arp = note(melody).s('supersaw').attack(0.008).decay(0.15)
  .sustain(0.12).release(0.10).lpf(2600).room(0.25).gain(0.055);
const openLead = arp.lpf(5200).gain(0.075);
lead$: renaissance(silence, silence, arp, arp.slow(2).lpf(1200),
  arp.lpf("<900 1200 1600 2200 2800 3400 4200 5200>/2"), openLead, silence);

// 7 · Long, bright minor harmony under the arpeggio.
const harmony = "<[e3,g3,b3,e4] [c3,e3,g3,c4] [g2,b2,d3,g3] [d3,fs3,a3,d4]>/4";
const pad = note(harmony).s('supersaw').attack(0.5).decay(0.4)
  .sustain(0.65).release(1.1).lpf(1700).room(0.45).gain(0.035);
chords$: renaissance(silence, silence, pad, pad.gain(0.055), pad,
  pad.lpf(2500), pad.gain(0.02));

// 8 · Sparse spoken texture and a count into the return.
const voice = s("nightvox:4 ~ ~ ~").slow(4).room(0.55).gain(0.065);
const count = arrange([12, silence], [4, s("nightvox:<0 1 2 3>")])
  .room(0.2).gain(0.10);
vocals$: renaissance(silence, silence, voice, voice.slow(2), count,
  voice, silence);
