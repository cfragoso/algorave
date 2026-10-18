"""Phrase → generated song, saved through the engine API without touching live decks."""
import os
from maltego.server import MaltegoEntity, MaltegoContext, MaltegoException, register_transform
from client import AlgoraveClient
from entities import Song
from transforms import SET, song_entity


@register_transform(display_name='Generate Song [Algorave]', transform_set=SET,
                    description='Compose and save an eight-channel Strudel song from this phrase. Supports house, techno, trance, ambient, mood words and a BPM hint. Offline procedural generation; does not load or play a deck.')
async def generate(input_entity: MaltegoEntity['maltego.Phrase'], context: MaltegoContext) -> Song:
    phrase = input_entity.value
    if not isinstance(phrase, str) or not phrase.strip() or len(phrase) > 500:
        raise MaltegoException('Use a phrase containing 1–500 characters.')
    async with AlgoraveClient(os.getenv('ALGORAVE_API_URL', 'http://127.0.0.1:3000')) as api:
        saved = await api.request('POST', '/api/songs/generate', {'phrase': phrase})
        if not isinstance(saved, dict) or not saved.get('id'):
            raise MaltegoException('The engine did not confirm the saved song. Inspect the song library before retrying.')
        context.log.inform(f'Saved {saved["name"]} · {saved["bpm"]} BPM · {saved.get("generation", {}).get("genre", "generated")}. Use Load into Deck to play it.')
        return song_entity(api.url, saved)
