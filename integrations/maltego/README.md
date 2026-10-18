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

**http://127.0.0.1:8081/seed**

Discovery includes all four custom entity definitions and the Algorave transform set. No manual entity creation or separate entity package is necessary with a client supporting the SDK v3 protocol. The HTTP endpoint is for a local client. Maltego Graph Browser requires trusted HTTPS; see the [SDK's HTTPS instructions](https://github.com/MaltegoTech/maltego-transforms#your-first-transform) for that deployment.

Drag **Algorave Engine** from the Algorave palette category into a graph. Its default Engine URL is `http://127.0.0.1:3000`; its Identity can be any unique name, such as `studio-laptop`.

## Transforms

| Input | Transform | Result / operation |
| --- | --- | --- |
| `maltego.algorave.engine` | To Songs | Catalogue of `maltego.algorave.song` entities |
| `maltego.algorave.engine` | To Decks | Decks A and B as `maltego.algorave.decks` |
| `maltego.algorave.decks` | To Instrument | Channel instruments as `maltego.algorave.instrument` |
| `maltego.algorave.decks` | To Song | Song currently loaded in that deck, or no result if empty |
| `maltego.algorave.instrument` | Mute | Set the channel mute control to 1 |
| `maltego.algorave.instrument` | Unmute | Set the channel mute control to 0 |
| `maltego.algorave.instrument` | Update | Apply the edited component code to that instrument |

Deck labels show deck ID, playing/stopped state, song name and BPM. Decks have a red colour overlay while playing and a green overlay while stopped, plus a coloured status field. These are snapshots when **To Decks** runs: rerun it to refresh the graph. They indicate transport state, not measured audible output; a playing deck may still be silent because of the mixer. Stable identities and loose matching on mutable properties allow results to merge with existing graph nodes.

To Instrument returns every track slot in the loaded score (normally eight), with channel number, enabled, muted, solo and component code. `Enabled` describes inclusion in the arrangement. `Muted` is the channel's mute control; solo on another track, master volume and the crossfader also affect audibility. Instruments on A and B remain separate, even when both decks load the same song.

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

For a remote audio engine, set `ALGORAVE_API_URL` to its reachable address and set the Engine URL property to the same value. Returned entities carry this URL automatically. Requests are restricted to the configured engine, do not follow redirects and never store the token in graph entities. Keep `.env` private.

The transform service binds to loopback. Run it on the same computer as your local Maltego client; it can communicate with an Algorave engine on another device. It is a development service with no incoming-client authentication; configure SDK authentication and trusted HTTPS before exposing it beyond your own computer.

## Verify

```sh
.venv/bin/python -m unittest -v
```

Tests use a simulated control API, including separate deck routing, editable-property serialization, colour overlays, failed/pending jobs, stale component rejection, authentication errors and draft preservation. They do not change your live mix. Discovery endpoints are `/assets/entities` and `/transforms`.

The integration has been checked against the running Algorave API using read-only requests. Installation and rendering inside the Maltego desktop client still need to be verified on your client version.
