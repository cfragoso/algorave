"""Graph navigation and explicit instrument commands for both Strudel decks."""
import hashlib
from html import escape
from typing import Any, Dict, List, Optional
from urllib.parse import quote

from maltego.server import (MaltegoContext, MaltegoException, OverlayPositions,
                            OverlayTypes, TransformSetting, register_transform)
from client import AlgoraveClient
from entities import Engine, Song, Deck, Instrument

SET = 'Algorave'


def digest(code):
    return hashlib.sha256(code.encode('utf-8')).hexdigest()


def put(entity, **properties):
    for name, value in properties.items():
        entity.set_property('algorave.' + name, value)
    return entity


def song_entity(url, song):
    return put(Song(f"{url}/songs/{song['id']}"), engine_url=url, song_id=song['id'],
               song_name=song['name'], label=song['name'], bpm=song['bpm'])


def deck_entity(url, state):
    song = state.get('song') or {}
    playing = bool(state.get('playback'))
    colour = 'red' if playing else 'green'
    label = f"Deck {state['deck']} · {'PLAYING' if playing else 'STOPPED'} · {song.get('name', 'No song')}"
    if song.get('bpm') is not None:
        label += f" · {song['bpm']} BPM"
    entity = put(Deck(f"{url}/decks/{state['deck']}"), engine_url=url, deck=state['deck'],
                 song_id=song.get('id', ''), song_name=song.get('name', ''),
                 bpm=song.get('bpm'), playing=playing, colour=colour, label=label,
                 revision=state.get('revision', 0))
    entity.add_overlay(OverlayTypes.COLOR, OverlayPositions.CENTER, 'algorave.colour')
    entity.add_display_field('Deck status', f'<div style="color:{colour}"><b>{escape(label)}</b></div>')
    return entity


def instrument_entity(url, state, track):
    column = track['column']
    values = state.get('mixerValues') or []
    mix = values[column - 1] if len(values) >= column else {}
    muted = bool(mix.get('mute', 0))
    entity = put(Instrument(f"{url}/decks/{state['deck']}/songs/{state['song']['id']}/tracks/{track['id']}"),
                 engine_url=url, deck=state['deck'], song_id=state['song']['id'],
                 track_id=track['id'], column=column, enabled=bool(track.get('enabled', True)),
                 muted=muted, solo=bool(mix.get('solo', 0)), code=track['code'],
                 source_hash=digest(track['code']), revision=state.get('revision', 0),
                 label=f"{state['deck']} · {column:02d} {track['id']} · {'MUTED' if muted else 'UNMUTED'}")
    return entity


async def current_instrument(api, entity):
    state = await api.state(entity.deck)
    if not state.get('song') or state['song']['id'] != entity.song_id:
        raise MaltegoException('The loaded song changed. Extract fresh instruments from this deck.')
    track = next((t for t in state['song'].get('tracks', []) if t['id'] == entity.track_id), None)
    if not track or track['column'] != entity.column:
        raise MaltegoException('Instrument/channel changed. Extract fresh instruments from this deck.')
    return state, track


def refresh_input(entity, fresh):
    # Preserve the graph entity ID so the SDK updates the original node.
    for name, prop in fresh.get_properties().items():
        entity.set_property(name, prop.value)
    entity.overlays = fresh.overlays
    entity.display_information = fresh.display_information
    return entity


@register_transform(display_name='To Songs [Algorave]', transform_set=SET)
async def to_songs(input_entity: Engine) -> List[Song]:
    async with AlgoraveClient(input_entity.engine_url) as api:
        return [song_entity(api.url, song) for song in await api.request('GET', '/api/songs')]


@register_transform(display_name='To Decks [Algorave]', transform_set=SET)
async def to_decks(input_entity: Engine) -> List[Deck]:
    async with AlgoraveClient(input_entity.engine_url) as api:
        state = await api.request('GET', '/api/session/state')
        return [deck_entity(api.url, state['decks'][deck]) for deck in ('A', 'B')]


@register_transform(display_name='To Instrument [Algorave]', transform_set=SET)
async def to_instruments(input_entity: Deck) -> List[Instrument]:
    async with AlgoraveClient(input_entity.engine_url) as api:
        state = await api.state(input_entity.deck)
        return [instrument_entity(api.url, state, track) for track in (state.get('song') or {}).get('tracks', [])]


@register_transform(display_name='To Song [Algorave]', transform_set=SET)
async def to_song(input_entity: Deck) -> Optional[Song]:
    async with AlgoraveClient(input_entity.engine_url) as api:
        song = (await api.state(input_entity.deck)).get('song')
        return song_entity(api.url, song) if song else None


async def set_mute(entity, value):
    async with AlgoraveClient(entity.engine_url) as api:
        await current_instrument(api, entity)
        await api.write(f'/api/decks/{entity.deck}/mixer',
                        {'column': entity.column, 'parameter': 'mute', 'value': value})
        state, track = await current_instrument(api, entity)
        fresh = instrument_entity(api.url, state, track)
        # Mute must not overwrite a component draft edited on the graph.
        fresh.code, fresh.source_hash = entity.code, entity.source_hash
        return refresh_input(entity, fresh)


@register_transform(display_name='Mute [Algorave]', transform_set=SET)
async def mute(input_entity: Instrument) -> Instrument:
    return await set_mute(input_entity, 1)


@register_transform(display_name='Unmute [Algorave]', transform_set=SET)
async def unmute(input_entity: Instrument) -> Instrument:
    return await set_mute(input_entity, 0)


@register_transform(display_name='Update [Algorave]', transform_set=SET,
                    description='Apply edited Component code to this live instrument. Waits for compilation acknowledgement.')
async def update(input_entity: Instrument, context: MaltegoContext) -> Instrument:
    if not input_entity.code or not input_entity.code.strip():
        raise MaltegoException('Component code cannot be empty.')
    async with AlgoraveClient(input_entity.engine_url) as api:
        _, track = await current_instrument(api, input_entity)
        if digest(track['code']) != input_entity.source_hash:
            raise MaltegoException('This instrument changed since extraction. Save your draft and extract fresh instruments before applying.')
        job = await api.write(f'/api/decks/{input_entity.deck}/tracks/{quote(input_entity.track_id, safe="")}',
                              {'code': input_entity.code})
        state, track = await current_instrument(api, input_entity)
        if track['code'] != input_entity.code:
            raise MaltegoException('The instrument changed again after applying. Extract fresh instruments to inspect the current code.')
        context.log.inform(f"Applied component code (job {job['id']}).")
        return refresh_input(input_entity, instrument_entity(api.url, state, track))


async def deck_command(entity, action):
    async with AlgoraveClient(entity.engine_url) as api:
        await api.state(entity.deck)  # Validate the deck before constructing a write URL.
        path = f'/api/decks/{entity.deck}/'
        if action == 'sync':
            await api.write(path + 'sync', {}, method='POST')
        else:
            await api.write(path + 'transport', {'action': action}, method='POST')
        return refresh_input(entity, deck_entity(api.url, await api.state(entity.deck)))


@register_transform(display_name='Play [Algorave]', transform_set=SET)
async def play(input_entity: Deck) -> Deck:
    return await deck_command(input_entity, 'play')


@register_transform(display_name='Stop [Algorave]', transform_set=SET)
async def stop(input_entity: Deck) -> Deck:
    return await deck_command(input_entity, 'stop')


@register_transform(display_name='Beat Sync [Algorave]', transform_set=SET,
                    description='Match this deck to the other deck BPM and beat phase. Enable both decks first.')
async def beat_sync(input_entity: Deck) -> Deck:
    return await deck_command(input_entity, 'sync')


@register_transform(display_name='Change Volume [Algorave]', transform_set=SET,
                    description='Set this deck channel fader in the main mixer, from 0 to 100 percent.',
                    settings=[TransformSetting(name='volume', display_name='Deck volume (0–100)',
                                               type=TransformSetting.Types.int, optional=False,
                                               popup=True, default_value=80)])
async def change_volume(input_entity: Deck, settings: Dict[str, Any]) -> Deck:
    raw = settings.get('volume')
    try:
        if isinstance(raw, bool) or raw is None:
            raise ValueError()
        volume = int(str(raw).strip())
        if not 0 <= volume <= 100:
            raise ValueError()
    except (ValueError, TypeError):
        raise MaltegoException('Enter a whole-number deck volume from 0 to 100.') from None
    async with AlgoraveClient(input_entity.engine_url) as api:
        await api.state(input_entity.deck)
        await api.write('/api/mixer', {'channels': {input_entity.deck: {'volume': volume / 100}}})
        return refresh_input(input_entity, deck_entity(api.url, await api.state(input_entity.deck)))


@register_transform(display_name='Load into Deck [Algorave]', transform_set=SET,
                    description='Load this song from the engine catalogue into deck A or B. Does not start playback.',
                    settings=[TransformSetting(name='deck', display_name='Destination deck (A or B)',
                                               type=TransformSetting.Types.str, optional=False,
                                               popup=True, default_value='A')])
async def load_into_deck(input_entity: Song, settings: Dict[str, Any]) -> Deck:
    deck = str(settings.get('deck', '')).strip().upper()
    if deck not in ('A', 'B'):
        raise MaltegoException('Enter destination deck A or B.')
    if not input_entity.song_id:
        raise MaltegoException('Song ID is missing. Extract fresh songs from the engine.')
    async with AlgoraveClient(input_entity.engine_url) as api:
        await api.write(f'/api/decks/{deck}/songs/load', {'id': input_entity.song_id}, method='POST')
        return deck_entity(api.url, await api.state(deck))
