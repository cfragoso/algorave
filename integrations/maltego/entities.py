"""Custom entities are distributed automatically through SDK discovery."""
from maltego.server import (MaltegoEntity, MaltegoEntityConfig, MaltegoEntityProperty as MEF,
                            register_entity)


def config(name, plural, root=False):
    return MaltegoEntityConfig(value_property='algorave.id', display_property='algorave.label',
                              display_name=name, display_name_plural=plural,
                              category='Algorave', allowed_root=root)


@register_entity
class Engine(MaltegoEntity):
    engine_url: str = MEF(matching_rule='loose', name='algorave.engine_url', display_name='Engine URL',
                          value='http://127.0.0.1:3000')
    TYPE_NAME = 'maltego.algorave.engine'
    Config = config('Algorave Engine', 'Algorave Engines', True)
    identity: str = MEF(name='algorave.id', value='local-engine')
    label: str = MEF(name='algorave.label', value='Algorave Engine', matching_rule='loose')


@register_entity
class Song(MaltegoEntity):
    identity: str = MEF(matching_rule='strict', name='algorave.id', display_name='Identity', readonly=True)
    label: str = MEF(matching_rule='loose', name='algorave.label', display_name='Label', readonly=True)
    engine_url: str = MEF(matching_rule='loose', name='algorave.engine_url', display_name='Engine URL',
                          value='http://127.0.0.1:3000')
    TYPE_NAME = 'maltego.algorave.song'
    Config = config('Algorave Song', 'Algorave Songs')
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
    Config = config('Algorave Deck', 'Algorave Decks')
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
    Config = config('Algorave Instrument', 'Algorave Instruments')
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
    source_hash: str = MEF(matching_rule='loose', name='algorave.source_hash', readonly=True, hidden=True)
