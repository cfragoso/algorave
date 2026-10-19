"""Rename, remove and restore library entries without changing loaded decks."""
from typing import Any, Dict
from urllib.parse import quote
from maltego.server import MaltegoException, TransformSetting, register_transform
from client import AlgoraveClient
from entities import Song
from transforms import SET, song_entity, refresh_input, put


def route(entity):
    if not entity.song_id:
        raise MaltegoException('Extract a fresh song entity first.')
    return '/api/songs/' + quote(entity.song_id, safe='')


@register_transform(display_name='Rename Song [Algorave]', transform_set=SET,
                    settings=[TransformSetting(name='name',display_name='New song name',optional=False,popup=True)])
async def rename_song(input_entity: Song, settings: Dict[str, Any]) -> Song:
    name = settings.get('name')
    if not isinstance(name,str) or not name.strip() or len(name.strip())>120:
        raise MaltegoException('Enter a song name containing 1–120 characters.')
    async with AlgoraveClient(input_entity.engine_url) as api:
        saved = await api.request('PATCH', route(input_entity), {'name':name.strip()})
        return refresh_input(input_entity, song_entity(api.url,saved))


@register_transform(display_name='Delete Song [Algorave]',transform_set=SET,
                    description='Remove from the shared library. Loaded decks keep playing. Restore Song reverses this action.',
                    settings=[TransformSetting(name='confirm',display_name='Confirm removal from library (recoverable)',
                    type=TransformSetting.Types.boolean,optional=False,popup=True,default_value=False)])
async def delete_song(input_entity: Song, settings: Dict[str, Any]) -> Song:
    if settings.get('confirm') is not True:
        raise MaltegoException('Set Confirm removal to true to delete this library entry.')
    async with AlgoraveClient(input_entity.engine_url) as api:
        saved = await api.request('DELETE', route(input_entity))
        fresh = put(song_entity(api.url, saved), deleted=True, label=saved['name'] + ' (deleted)')
        return refresh_input(input_entity, fresh)


@register_transform(display_name='Restore Song [Algorave]',transform_set=SET,
                    description='Restore a previously deleted song to the shared library.')
async def restore_song(input_entity: Song) -> Song:
    async with AlgoraveClient(input_entity.engine_url) as api:
        saved = await api.request('POST', route(input_entity)+'/restore', {})
        return refresh_input(input_entity, song_entity(api.url,saved))
