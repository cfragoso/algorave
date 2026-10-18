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

Discovery includes all four custom entity definitions and the Algorave transform set. No manual entity creation or separate entity package is necessary with a client supporting the SDK v3 protocol. The service uses HTTPS by default. On first startup it generates a local self-signed certificate for `localhost` and `127.0.0.1` in ignored `.local/`, with a private key readable only by its owner. Existing certificates are retained across restarts. This does not install any certificate into your operating system or Maltego trust store.

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
