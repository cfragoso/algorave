# Vocals

[strudel.json](strudel.json) defines the `nightvox` sample bank: four spoken
number samples and one short vocal from [TidalCycles Dirt-Samples](https://github.com/tidalcycles/Dirt-Samples).
The manifest references the original remote files; audio is not copied here.
The current songs include the same paths inline so they can be pasted directly.

Put your own recordings in [audio/](audio/), using descriptive filenames such
as `audio/warehouse-call.wav`, then add a bank to the manifest. For files in
this repository, use their complete raw GitHub URLs rather than the current
Dirt-Samples `_base`. For example, after uploading your recording:

```javascript
await samples({
  myvox: ['https://raw.githubusercontent.com/cfragoso/algorave/main/vocals/audio/warehouse-call.wav']
})
$: s("myvox ~ ~ ~")
```

That example filename is a placeholder; upload your audio before using it.
Alternatively serve your recordings locally for rehearsals and offline shows.
To load the published manifest, after this repository is pushed:

```javascript
await samples('https://raw.githubusercontent.com/cfragoso/algorave/main/vocals/strudel.json')
```
