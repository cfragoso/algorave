"""Custom entities are distributed automatically through SDK discovery."""
from pathlib import Path

from maltego.server import (MaltegoEntity, MaltegoEntityConfig, MaltegoEntityProperty as MEF,
                            register_entity, Overlay, OverlayTypes, OverlayPositions)


def config(name, plural, root=False, icon=None, overlays=None):
    return MaltegoEntityConfig(value_property='algorave.label', display_property='algorave.label',
                              display_name=name, display_name_plural=plural,
                              category='Algorave', allowed_root=root, overlays=overlays,
                              icon_resource=(f'algorave-{icon}', str(Path(__file__).parent / 'icons' / f'{icon}.png')) if icon else None)


@register_entity
class Engine(MaltegoEntity):
    engine_url: str = MEF(matching_rule='loose', name='algorave.engine_url', display_name='Engine URL',
                          value='http://127.0.0.1:3000')
    TYPE_NAME = 'maltego.algorave.engine'
    Config = config('Algorave Engine', 'Algorave Engines', True, icon='engine')
    identity: str = MEF(name='algorave.id', value='local-engine')
    label: str = MEF(name='algorave.label', value='Algorave Engine', matching_rule='loose')


@register_entity
class Song(MaltegoEntity):
    identity: str = MEF(matching_rule='strict', name='algorave.id', display_name='Identity', readonly=True)
    label: str = MEF(matching_rule='loose', name='algorave.label', display_name='Label', readonly=True)
    engine_url: str = MEF(matching_rule='loose', name='algorave.engine_url', display_name='Engine URL',
                          value='http://127.0.0.1:3000')
    TYPE_NAME = 'maltego.algorave.song'
    Config = config('Algorave Song', 'Algorave Songs', icon='song')
    deleted: bool = MEF(name='algorave.deleted', matching_rule='loose', value=False, readonly=True)
    song_id: str = MEF(matching_rule='loose', name='algorave.song_id', readonly=True)
    song_name: str = MEF(matching_rule='loose', name='algorave.song_name', readonly=True)
    bpm: float = MEF(matching_rule='loose', name='algorave.bpm', readonly=True)


@register_entity
class Deck(MaltegoEntity):
    identity: str = MEF(matching_rule='strict', name='algorave.id', display_name='Identity', readonly=True)
    label: str = MEF(matching_rule='loose', name='algorave.label', display_name='Label', readonly=True)
    engine_url: str = MEF(matching_rule='loose', name='algorave.engine_url', display_name='Engine URL',
                          value='http://127.0.0.1:3000')
    TYPE_NAME = 'maltego.algorave.decks'
    Config = config('Algorave Deck', 'Algorave Decks', icon='deck', overlays=[
        Overlay(OverlayTypes.TEXT, OverlayPositions.NORTH, 'algorave.deck'),
        Overlay(OverlayTypes.COLOR, OverlayPositions.NORTHWEST, 'algorave.colour'),
        Overlay(OverlayTypes.TEXT, OverlayPositions.WEST, 'algorave.bpm')])
    deck: str = MEF(matching_rule='loose', name='algorave.deck', readonly=True)
    song_id: str = MEF(matching_rule='loose', name='algorave.song_id', readonly=True)
    song_name: str = MEF(matching_rule='loose', name='algorave.song_name', readonly=True)
    bpm: float = MEF(matching_rule='loose', name='algorave.bpm', readonly=True)
    playing: bool = MEF(matching_rule='loose', name='algorave.playing', readonly=True)
    colour: str = MEF(matching_rule='loose', name='algorave.colour', readonly=True)
    revision: int = MEF(matching_rule='loose', name='algorave.revision', readonly=True)


@register_entity
class Instrument(MaltegoEntity):
    identity: str = MEF(matching_rule='strict', name='algorave.id', display_name='Identity', readonly=True)
    label: str = MEF(matching_rule='loose', name='algorave.label', display_name='Label', readonly=True)
    engine_url: str = MEF(matching_rule='loose', name='algorave.engine_url', display_name='Engine URL',
                          value='http://127.0.0.1:3000')
    TYPE_NAME = 'maltego.algorave.instrument'
    Config = config('Algorave Instrument', 'Algorave Instruments', overlays=[
        Overlay(OverlayTypes.TEXT, OverlayPositions.NORTH, 'algorave.column'),
        Overlay(OverlayTypes.COLOR, OverlayPositions.NORTHWEST, 'algorave.colour'),
        Overlay(OverlayTypes.TEXT, OverlayPositions.WEST, 'algorave.gain_display')])
    deck: str = MEF(matching_rule='loose', name='algorave.deck', readonly=True)
    song_id: str = MEF(matching_rule='loose', name='algorave.song_id', readonly=True)
    track_id: str = MEF(matching_rule='loose', name='algorave.track_id', readonly=True)
    column: int = MEF(matching_rule='loose', name='algorave.column', readonly=True)
    enabled: bool = MEF(matching_rule='loose', name='algorave.enabled', readonly=True)
    muted: bool = MEF(matching_rule='loose', name='algorave.muted', readonly=True)
    solo: bool = MEF(matching_rule='loose', name='algorave.solo', readonly=True)
    revision: int = MEF(matching_rule='loose', name='algorave.revision', readonly=True)
    code: str = MEF(matching_rule='loose', name='algorave.code', display_name='Component code (edit then Update)',
                    description='Strudel pattern expression for this instrument; not the entire score.')
    colour: str = MEF(matching_rule='loose', name='algorave.colour', readonly=True)
    gain: float = MEF(matching_rule='loose', name='algorave.gain', display_name='Channel gain (0–1)', readonly=True)
    gain_display: str = MEF(matching_rule='loose', name='algorave.gain_display', display_name='Channel gain (%)', readonly=True)
    source_hash: str = MEF(matching_rule='loose', name='algorave.source_hash', readonly=True, hidden=True)


@register_entity
class Mixer(MaltegoEntity):
    TYPE_NAME = 'maltego.algorave.mixer'
    Config = config('Mixer', 'Mixers', icon='engine')
    identity: str = MEF(name='algorave.id', matching_rule='strict', readonly=True)
    label: str = MEF(name='algorave.label', matching_rule='loose', readonly=True)
    engine_url: str = MEF(name='algorave.engine_url', matching_rule='loose', readonly=True)
    master: float = MEF(name='algorave.master', display_name='Master volume (0–1)', matching_rule='loose', readonly=True)
    crossfader: float = MEF(name='algorave.crossfader', matching_rule='loose', readonly=True)


@register_entity
class MixerChannel(MaltegoEntity):
    TYPE_NAME = 'maltego.algorave.mixer.channels'
    Config = config('Mixer Channel', 'Mixer Channels', icon='deck')
    identity: str = MEF(name='algorave.id', matching_rule='strict', readonly=True)
    label: str = MEF(name='algorave.label', matching_rule='loose', readonly=True)
    engine_url: str = MEF(name='algorave.engine_url', matching_rule='loose', readonly=True)
    deck: str = MEF(name='algorave.deck', matching_rule='loose', readonly=True)
    volume: float = MEF(name='algorave.volume', display_name='Channel volume (0–1)', matching_rule='loose', readonly=True)
    master: float = MEF(name='algorave.master', display_name='Master volume (0–1)', matching_rule='loose', readonly=True)
    crossfader: float = MEF(name='algorave.crossfader', matching_rule='loose', readonly=True)
    high: float = MEF(name='algorave.high', display_name='High EQ (dB)', matching_rule='loose', readonly=True)
    mid: float = MEF(name='algorave.mid', display_name='Mid EQ (dB)', matching_rule='loose', readonly=True)
    low: float = MEF(name='algorave.low', display_name='Low EQ (dB)', matching_rule='loose', readonly=True)
