// Run controllers/launch-control-xl/setup.js ONCE in this tab before using this score.
// Then replace the editor with this file. Keep setup out of the projected score.
// Start with the kick; add one commented part at a time by removing //.
// Click Update after each edit while playback continues.
setcpm(134 / 4)

// 1 KICK — four beats per bar
kick$: liveStrip(1, s("bd*4").bank('tr909').gain(0.6))

// 3 CLOSED HATS — add next, then try hh*16 instead of hh*8
// hats$: liveStrip(3, s("hh*8").bank('tr909').gain("0.12 0.06"))

// 2 CLAP — on beats two and four
// clap$: liveStrip(2, s("~ cp ~ cp").bank('tr909').gain(0.25))

// 5 BASS — leave space for the kick; change the final e2 to g2 or b1
// bass$: liveStrip(5, note("~ e2 ~ e2 ~ e2 ~ e2").s("sawtooth").decay(0.12).sustain(0).gain(0.12))

// 4 OPEN HATS — offbeats make the groove lift
// open$: liveStrip(4, s("~ oh ~ oh ~ oh ~ oh").bank('tr909').gain(0.1))

// 6 LEAD — begin with four notes, then change the rhythm yourself
// lead$: liveStrip(6, note("e3 g3 b3 d4").s("sawtooth").decay(0.1).sustain(0).gain(0.07))

// 7 CHORDS — one short E minor chord per bar
// chords$: liveStrip(7, note("[e3,g3,b3]").s("triangle").decay(0.3).sustain(0).gain(0.08))

// 8 VOCALS — one spoken hit every four bars; samples loaded by setup
// vocals$: liveStrip(8, s("nightvox:0 ~ ~ ~").slow(4).gain(0.18))

// BREAK: comment out kick and bass, leave hats/chords/vocals playing.
// DROP: restore kick and bass together; avoid adding another edit immediately.
// OUTRO: remove lead, vocals, chords, bass, clap, hats, then kick.
// The top knob sets each part's low-pass cutoff; use it for filter sweeps.
