# Live mapping observations

Captured on 2026-10-16 from the connected Launch Control XL.
The selected hardware template number is not yet known. Keep it selected
while identifying controls. No controller settings have been changed.

- CoreMIDI sources: `Launch Control XL`, `Launch Control XL HUI`.
- User moved only the leftmost fader and confirmed completion.
- Main sweep: status B1, controller 4D, i.e. MIDI channel 2, CC77.
- User then turned only the top-left knob and confirmed completion.
  Clear up/down sweep: status B0, controller 0D, values 0–127, i.e.
  MIDI channel 1, CC13. Mapped to low-pass cutoff in the test.
- Middle-left knob: user confirmed isolated movement; captured 445 CC29
  messages on MIDI channel 1, spanning 0–127. Mapped to resonance.
- Bottom-left knob: user confirmed isolated movement; captured 236 CC49
  messages on MIDI channel 1, spanning 0–127. Mapped to reverb.
- Upper-left button: user reported two press/release actions; received
  B0 29 7F followed by B0 29 00 (CC41, MIDI channel 1, values 127/0).
  This is consistent with toggle behavior across the two presses. The
  test uses received state directly: 127 mutes, 0 restores new events.
- Lower-left button: one press, one-second hold, release produced
  B0 49 7F only: CC73, MIDI channel 1, value 127. No release message
  observed, consistent with a toggle. Its next off press remains to test.
- Nearby CC78 and CC79 also varied slightly; these controls have not yet
  been identified individually. Do not treat them as confirmed mappings.
- Initial packets included channel 1 CCs 14–20, 29–36, 49–55 and channel 2
  CCs 77–84. Their physical positions still need individual verification.

`examples/controller-first-column.js` maps the observed left fader to kick volume and
the top-left knob to cutoff.
The techno song now uses these current-template assignments for column 1.
Column 2 was subsequently verified: fader CC78/channel 2; top knob CC14,
middle CC30, bottom CC50, upper button CC42, lower button CC74 on channel 1.
Each continuous control swept 0–127. Each button produced value 127 on its
single press/release; keep mute/solo states in mind when auditioning.
CC79 also varied during the column-2 capture. A subsequent isolated column-3
test confirmed it as fader 3.
Columns 5–8 provisionally use consecutive CCs; these are inferred and still
need physical verification. The older `examples/legacy-custom-template/example.js` is
still a separate example for the proposed custom template.

| Control | Columns 1–8 confirmed, left to right | MIDI channel |
| --- | --- | --- |
| Fader | 77, 78, 79, 80, 81, 82, 83, 84 | 2 |
| Top knob | 13, 14, 15, 16, 17, 18, 19, 20 | 1 |
| Middle knob | 29, 30, 31, 32, 33, 34, 35, 36 | 1 |
| Bottom knob | 49, 50, 51, 52, 53, 54, 55, 56 | 1 |
| Upper button | 41, 42, 43, 44, 57, 58, 59, 60 | 1 |
| Lower button | 73, 74, 75, 76, 89, 90, 91, 92 | 1 |

## Column 3 verification

Confirmed by the requested ordered physical test: fader CC79/channel 2
(24–127 captured); top CC15, middle CC31, bottom CC51/channel 1
(each 0–127); upper button CC43 and lower CC75/channel 1 (127 each).
Additional button events: CC41=127 and CC42=0 on channel 1.
These additional events change mute states for columns 1 and 2.

Columns 1–3 are identified; only columns 4–8 remain provisional.

## Column 4 verification

Ordered isolated test confirmed: fader CC80/channel 2; top CC16, middle
CC32, bottom CC52/channel 1; all four swept 0–127. Upper button CC44
and lower CC76/channel 1 each sent 127. Additional events CC74=0 and
CC75=0 show solo switched off for columns 2 and 3. Columns 1–4 are
now identified; columns 5–8 remain provisional.

## Column 5 verification

Fader CC81/channel 2; top CC17, middle CC33, bottom CC53/channel 1;
all swept 0–127. Upper button CC57 and lower CC89/channel 1 each sent
127. The observed button numbering jumps after column 4. Corrected the
song from inferred CC45/77 to observed CC57/89. Provisional buttons for
columns 6–8 now follow the second group: CC58–60 and CC90–92.

## Column 6 verification

Confirmed fader CC82/channel 2; top CC18, middle CC34, bottom CC54/channel 1;
all swept 0–127. Upper CC58 and lower CC90/channel 1 each sent 127.
Additional events CC57=0 and CC44=0 switched off those mute states.
CC19 varied 126–127 but is not yet individually identified as column 7.
Columns 1–6 are now identified; only columns 7–8 remain provisional.

## Column 7 verification

Confirmed top CC19, middle CC35, bottom CC55/channel 1; fader CC83/channel 2;
all swept 0–127. Upper CC59 and lower CC91/channel 1 each sent 127.
CC20, CC36 and CC56 also varied, but column 8 still needs isolated verification.
Columns 1–7 are identified; only column 8 remains provisional.

## Column 8 verification — mapping complete

Confirmed fader CC84/channel 2; top CC20, middle CC36, bottom CC56/channel 1;
all swept 0–127. Upper CC60 and lower CC92/channel 1 each sent 127.
All eight columns are now identified. Historical provisional statements above
record the discovery sequence; the table is the final verified mapping.
The techno song now enables MIDI by default. Keep the same controller template
selected, clear unwanted mute/solo states, and move every continuous control
to transmit its current position after connecting.
