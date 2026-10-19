# Algorave Maltego transforms

Python integration built with [MaltegoTech/maltego-transforms](https://github.com/MaltegoTech/maltego-transforms), pinned to SDK 1.0.1. The service talks to the existing Algorave app API; it does not run another audio engine. No app rebuild or restart is needed.

## Start

Keep the Algorave app running on port 3000. From the repository root:

```sh
cd integrations/maltego
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
cp .env.example .env
.venv/bin/python project.py
```

Requires Python 3.10–3.14. On Windows use `.venv\Scripts\python.exe` instead of `.venv/bin/python`.

Add this seed URL to Maltego using its transform-server/seed installation flow:

**https://127.0.0.1:8081/seed**

Discovery includes all six custom entity definitions and the Algorave transform set. No manual entity creation or separate entity package is necessary with a client supporting the SDK v3 protocol. The service uses HTTPS by default. On first startup it generates a local self-signed certificate for `localhost` and `127.0.0.1` in ignored `.local/`, with a private key readable only by its owner. Existing certificates are retained across restarts. This does not install any certificate into your operating system or Maltego trust store.

If you previously installed the HTTP seed, update or reinstall that integration using the HTTPS seed above so stored transform-server URLs are refreshed. Your Engine URL remains `http://127.0.0.1:3000`: that is the separate Algorave API endpoint.

The client must trust the local certificate `.local/server.crt`. If Maltego offers a certificate acceptance prompt, verify it is this local certificate before accepting it. Otherwise import this certificate using the trust mechanism for your client. Browser clients also require browser/OS certificate trust; clicking through a browser warning alone may not permit background transform requests. See [Maltego certificate trust documentation](https://support.maltego.com/support/solutions/articles/15000062366-https-certificates-and-browser-trust).

For an existing trusted certificate pair set both `ALGORAVE_TLS_CERT` and `ALGORAVE_TLS_KEY`. The generated certificate expires after 365 days; renew it deliberately and update client trust. Private keys must never be committed.

Drag **Algorave Engine** from the Algorave palette category into a graph. Its default Engine URL is `http://127.0.0.1:3000`; its Identity can be any unique name, such as `studio-laptop`.

## Transforms

| Input | Transform | Result / operation |
| --- | --- | --- |
| `maltego.algorave.engine` | To Songs | Catalogue of `maltego.algorave.song` entities |
| `maltego.algorave.engine` | To Decks | Decks A and B as `maltego.algorave.decks` |
| `maltego.algorave.decks` | To Instrument | Channel instruments as `maltego.algorave.instrument` |
| `maltego.algorave.decks` | To Song | Song currently loaded in that deck, or no result if empty |
| `maltego.algorave.decks` | Play | Start the selected deck |
| `maltego.algorave.decks` | Stop | Stop the selected deck |
| `maltego.algorave.decks` | Beat Sync | Match the selected deck to the other deck's BPM and beat phase |
| `maltego.algorave.decks` | Change Volume | Prompt for a whole number 0–100; change that deck's main mixer channel fader |
| `maltego.algorave.song` | Load into Deck | Prompt for A or B; load this catalogue song into the destination deck |
| `maltego.algorave.instrument` | Mute | Set the channel mute control to 1 |
| `maltego.algorave.instrument` | Unmute | Set the channel mute control to 0 |
| `maltego.algorave.instrument` | Update | Apply the edited component code to that instrument |

Entity values and overlays are snapshots when transforms run:

| Entity | Value below icon | North | Northwest | West |
| --- | --- | --- | --- | --- |
| Engine | Current setup name | — | — | — |
| Deck | Loaded song name, or No song | A / B | Red playing, green stopped | BPM |
| Instrument | Instrument name | Channel 1–8 | Red muted, green unmuted | Channel gain as a percentage |

Engine navigation (**To Songs**, **To Decks**) also refreshes the input engine name and icon. **Refresh Setup** updates just the engine. Play/Stop/Sync and instrument actions refresh the changed entity. These are graph snapshots, not a continuous telemetry subscription. Instrument gain is the software channel fader, not a parsed `.gain()` expression in source code, and an unknown gain is shown as `—`. Mute colour reflects the explicit mute control; solo, arrangement membership and the main mixer can still affect audibility.

Stable hidden routing identities remain separate from the visible values so similarly named songs/instruments on different decks do not merge accidentally. To Instrument returns all track slots in the loaded score, normally eight.

## Desktop icon and overlay migration

Older saved graphs can retain entity definitions pointing at the Unknown icon even after the SDK icons have installed. The supplied [desktop/algorave-mixer.mtz](desktop/algorave-mixer.mtz) contains the six entity definitions, three icon families and overlay mappings in Desktop import format.

1. Use Maltego's **Import Config** wizard to import that file. Include both **Entities** and **Icons**, and replace the existing Algorave definitions when prompted.
2. Refresh the integration from `https://127.0.0.1:8081/seed` to discover **Refresh Setup**.
3. Use a new graph for a clean check, add an Algorave Engine, and run **To Decks**, then **To Instrument**. Existing saved graphs may keep their own older definitions; rerun transforms to refresh entity values and per-entity overlays/icons.

Returned engine, deck and song entities also carry explicit public image URLs as a fallback independent of the installed type icon. That fallback requires access to the original image hosts. The MTZ's type icons are bundled locally and remain usable offline. The pack does not contain credentials, graphs or setup data.

Rebuild the pack after entity-definition changes with `.venv/bin/python build_entity_pack.py`. Archive contents and mappings are tested; the final import/rendering step must be checked in the user's Desktop client.

## Rename, delete and restore songs

On `maltego.algorave.song`, run **Rename Song** and enter the new name (1–120 characters). **Delete Song** removes the song from the library after its confirmation setting is set to true. The original graph entity is retained and marked `(deleted)` with `algorave.deleted=true`; run **Restore Song** to recover it.

These actions work for bundled and generated songs. Song IDs stay stable, so a rename updates the same graph node. Deleted entries disappear from **To Songs** and cannot be loaded by the library until restored. Other existing graph nodes remain snapshots until refreshed. Neither action changes a score already loaded in a deck, including its displayed name; reload it to use the renamed library entry.

Deletion is recoverable, not a permanent file purge. Names and deletion flags persist in the engine's `app/data/songs/.catalogue.json`; bundled source files and generated scores remain intact. Back up the whole song data directory. The UI offers the same controls and a **Deleted songs → Restore song** list.

## Generate a song from a Phrase

Run **Generate Song [Algorave]** on a standard `maltego.Phrase`. For example, use `Dark deep house at 122 BPM` or `Uplifting trance at 140 BPM`. The transform calls the same `POST /api/songs/generate` endpoint as the library's **New song** form and returns a saved song entity. Use **Load into Deck** on that result when ready.

Generation works offline without API keys. It is procedural composition, not an LLM or audio model: genre keywords (house, techno, trance, ambient/soundscape), mood words and an explicit BPM hint shape the arrangement; the full phrase seeds melodic variation and becomes the title. Unsupported descriptions still seed a house arrangement. Text is never evaluated as code. Vocals are existing chopped samples, not sung/spoken versions of the phrase.

The eight channels follow the existing MIDI mapping and share a 96-bar intro/groove/main/break/build/drop/outro arrangement. The same phrase produces the same musical parts but gets a new song ID on every generation. Generated songs persist on the engine server, appear in **To Songs**, and never automatically load or play either deck. A connected audio player is not required to generate or save.

The app must include the new generation endpoint. Refresh the HTTPS seed to discover the transform; configure `ALGORAVE_API_URL` and `ALGORAVE_TOKEN` as usual for remote engines. The phrase is sent only to that configured engine, not to an external AI provider. Files default to `app/data/songs/` (ignored by Git); back up or mount this directory for persistence.

## Master mixer graph

Run **To Mixer** on the engine to obtain `maltego.algorave.mixer`, then **To Channels** to obtain A and B as `maltego.algorave.mixer.channels`.

| Input | Transform | Setting |
| --- | --- | --- |
| Mixer or mixer channel | Crossfader | `left` (A), `middle` (equal-power blend), or `right` (B) |
| Mixer or mixer channel | Change Master Volume | Whole number 0–100 |
| Mixer channel | Change Channel Volume | Whole number 0–100 |
| Mixer channel | Change High EQ | −24 through +12 dB, 0 neutral |
| Mixer channel | Change Mid EQ | −24 through +12 dB, 0 neutral |
| Mixer channel | Change Low EQ | −24 through +12 dB, 0 neutral |

Master volume and crossfader affect the shared output even when invoked on a channel entity. Channel volume and EQ affect only that channel. These transforms return the selected entity with acknowledged mixer values; other graph nodes remain snapshots until extracted/refreshed again. They preserve the output-device selection and controls not included in the change.

Refresh the HTTPS seed for all 25 transforms. The new `desktop/algorave-mixer.mtz` adds both mixer entity types to the existing icon and overlay pack.

## Perform from the graph

Run **Play**, **Stop** or **Beat Sync** on a deck entity. The selected deck is the sync target: syncing A matches it to B, and syncing B matches it to A. Enable both audio decks and wait for pending operations before syncing. A stopped synced deck remains stopped; it aligns when played, following the app's existing behavior.

**Change Volume** opens a required transform-setting prompt for a whole number from 0 through 100. It updates the selected deck's main mixer channel volume (0–1 internally), leaving the master gain, crossfader and instrument faders alone. A muted instrument or a crossfader at the opposite end can still silence that deck.

On a song entity, **Load into Deck** asks for destination A or B and returns the loaded deck with its current status. It loads the song by catalogue ID, including when the song entity was extracted from a deck: unsaved edits in that deck are not copied. Loading does not issue a Play command; existing playback follows the app's normal load behavior. Deck actions target the current contents of that deck, even if the graph's song label was extracted earlier.

All actions wait for the app's acknowledgement job. An enabled browser audio player is required. To pick up new transforms, prompts and icons, refresh/reinstall the integration from its HTTPS seed. The engine, deck and song icons use the three supplied image URLs; the instrument icon remains unchanged.

## Edit an instrument

1. Run **To Decks** on your engine, then **To Instrument** on the desired deck.
2. Open an instrument's properties and edit **Component code (edit then Update)** (`algorave.code`). Use the full property editor for multiline text.
3. Run **Update** on that instrument.

For example, change the kick component to:

```js
s("bd*4").bank("tr909").gain(0.55)
```

This property contains one Strudel pattern expression, not an entire song. Shared functions and variables in the loaded score remain available through the app's existing track replacement mechanism. The returned instrument refreshes the applied code and source fingerprint. Mute and Unmute preserve any unsubmitted code draft in the graph.

Enable the audio player in the app before running write transforms. Writes wait for `/api/jobs/:id` to report `applied`; an HTTP 202 by itself is not reported as success. Compilation failures, no connected player, authentication errors and pending operations are shown as transform errors.

A song/channel identity check prevents edits targeting an obsolete loaded song. Update also checks the extracted source fingerprint against the live component. If another editor changed it, save your draft separately and extract fresh instruments before applying. The current app track API has no atomic compare-and-swap: avoid simultaneous code writers during the brief check/apply interval. An unconfirmed request or job timeout may have applied; inspect the deck/job before retrying.

## Configuration

Edit `.env` in this directory, then restart only the Python service:

| Variable | Default | Purpose |
| --- | --- | --- |
| `ALGORAVE_API_URL` | `http://127.0.0.1:3000` | Algorave API base URL |
| `ALGORAVE_TOKEN` | empty | Same API bearer token configured in the app |
| `ALGORAVE_TRANSFORMS_PORT` | `8081` | Local Python service port |
| `ALGORAVE_TLS_CERT` | generated `.local/server.crt` | TLS certificate PEM path |
| `ALGORAVE_TLS_KEY` | generated `.local/server.key` | TLS private key PEM path |

For a remote audio engine, set `ALGORAVE_API_URL` to its reachable address and set the Engine URL property to the same value. Returned entities carry this URL automatically. Requests are restricted to the configured engine, do not follow redirects and never store the token in graph entities. Keep `.env` private.

The transform service binds to loopback. Run it on the same computer as your local Maltego client; it can communicate with an Algorave engine on another device. It is a development service with no incoming-client authentication; configure SDK authentication and a trusted deployment certificate before exposing it beyond your own computer.

## Verify

```sh
.venv/bin/python -m unittest -v
```

Tests also check certificate names, key permissions and certificate reuse. API tests use a simulated control API, including separate deck routing, editable-property serialization, colour overlays, failed/pending jobs, stale component rejection, authentication errors and draft preservation. They do not change your live mix. Discovery endpoints are `/assets/entities` and `/transforms`.

The integration has been checked against the running Algorave API using read-only requests. Installation and rendering inside the Maltego desktop client still need to be verified on your client version.
