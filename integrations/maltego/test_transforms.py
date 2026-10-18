import copy
import json
import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch, Mock

import httpx
from maltego.server import MaltegoException
import transforms as tf
from client import AlgoraveClient
from entities import Engine, Song, Deck, Instrument

URL = 'http://127.0.0.1:3000'
SONG = {'id': 'test-song', 'name': 'Test Song', 'bpm': 120,
        'tracks': [{'id': 'kick', 'column': 1, 'enabled': True, 'code': 's("bd*4")'},
                   {'id': 'bass', 'column': 2, 'enabled': False, 'code': 'note("c2").s("sawtooth")'}]}


class TransformTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {'ALGORAVE_API_URL': URL, 'ALGORAVE_TOKEN': 'test-secret'})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.states = {deck: {'deck': deck, 'song': copy.deepcopy(SONG), 'revision': 2,
                             'playback': deck == 'A', 'mixerValues': [{'mute': 0, 'solo': 0, 'volume': .65}] * 2}
                       for deck in ('A', 'B')}
        self.master = {'channels': {'A': {'volume': .8}, 'B': {'volume': .8}}}
        self.writes = []
        self.polls = 0
        self.job_status = 'applied'
        self.transport = httpx.MockTransport(self.respond)
        self.factory = patch.object(tf, 'AlgoraveClient', lambda url: AlgoraveClient(url, transport=self.transport))
        self.factory.start()
        self.addCleanup(self.factory.stop)
        self.context = SimpleNamespace(graph=SimpleNamespace(get_observers=lambda: []))
        self.engine = Engine('engine')
        self.deck = tf.deck_entity(URL, self.states['A'])
        self.instrument = tf.instrument_entity(URL, self.states['A'], self.states['A']['song']['tracks'][0])

    def respond(self, request):
        self.assertEqual(request.headers['Authorization'], 'Bearer test-secret')
        path = request.url.path
        if request.method in ('PATCH', 'POST'):
            data = json.loads(request.content)
            self.writes.append((path, data))
            if path == '/api/mixer':
                if self.job_status == 'applied':
                    for deck, channel in data['channels'].items():
                        self.master['channels'][deck].update(channel)
                return httpx.Response(202, json={'id': 'job-1', 'status': 'pending'})
            state = self.states[path.split('/')[3]]
            if self.job_status == 'applied':
                if path.endswith('/transport'):
                    state['playback'] = data['action'] == 'play'
                elif path.endswith('/sync'):
                    other = self.states['B' if state['deck'] == 'A' else 'A']
                    state['song']['bpm'] = other['song']['bpm']
                    state['revision'] += 1
                elif path.endswith('/songs/load'):
                    state['song'] = copy.deepcopy(SONG)
                    state['revision'] += 1
                elif path.endswith('/mixer'):
                    state['mixerValues'] = copy.deepcopy(state['mixerValues'])
                    state['mixerValues'][data['column'] - 1]['mute'] = data['value']
                else:
                    state['song']['tracks'][0]['code'] = data['code']
                    state['revision'] += 1
            return httpx.Response(202, json={'id': 'job-1', 'status': 'pending'})
        if path.startswith('/api/jobs/'):
            self.polls += 1
            return httpx.Response(200, json={'id': 'job-1', 'status': self.job_status, 'error': 'Compile failed'})
        if path == '/api/mixer':
            return httpx.Response(200, json=self.master)
        if path == '/api/songs':
            return httpx.Response(200, json=[SONG])
        if path == '/api/session/state':
            return httpx.Response(200, json={'decks': self.states, 'setup': {'name': 'Studio Session'}})
        return httpx.Response(200, json=self.states[path.split('/')[3]])

    async def test_discovery_includes_editable_code_and_routing(self):
        for cls in (Engine, Song, Deck, Instrument):
            definition = cls.to_v3_entity_definition(cls).model_dump(by_alias=True)
            fields = {field['name']: field for field in definition['properties']['fields']}
            self.assertIn('algorave.engine_url', fields)
            self.assertIn('algorave.id', fields)
            self.assertIn('algorave.label', fields)
            if cls is Instrument:
                self.assertFalse(fields['algorave.code']['readonly'])
                self.assertIn('algorave.source_hash', fields)

    async def test_play_stop_refresh_deck_properties_and_status_field(self):
        deck = tf.deck_entity(URL, self.states['B'])
        identity = deck.maltego_entity_id
        await tf.play(deck)
        self.assertTrue(deck.playing)
        self.assertEqual(deck.colour, 'red')
        self.assertEqual(deck.value, 'Test Song')
        self.assertEqual(deck.colour, 'red')
        await tf.stop(deck)
        self.assertFalse(deck.playing)
        self.assertEqual(deck.colour, 'green')
        self.assertEqual(identity, deck.maltego_entity_id)
        self.assertEqual(self.writes, [('/api/decks/B/transport', {'action': 'play'}),
                                       ('/api/decks/B/transport', {'action': 'stop'})])

    async def test_sync_targets_selected_deck(self):
        self.states['B']['song']['bpm'] = 138
        deck = await tf.beat_sync(self.deck)
        self.assertEqual(deck.bpm, 138)
        self.assertEqual(self.writes, [('/api/decks/A/sync', {})])

    async def test_volume_scales_without_changing_other_deck(self):
        for value in (0, 37, 100):
            await tf.change_volume(self.deck, {'volume': value})
            self.assertEqual(self.master['channels']['A']['volume'], value / 100)
            self.assertEqual(self.master['channels']['B']['volume'], .8)
        self.assertEqual(self.writes[1], ('/api/mixer', {'channels': {'A': {'volume': .37}}}))

    async def test_settings_validation_precedes_writes(self):
        for value in (-1, 101, None, True, 'nan', 1.5, ''):
            with self.assertRaises(MaltegoException):
                await tf.change_volume(self.deck, {'volume': value})
        for value in ('C', '', None):
            with self.assertRaises(MaltegoException):
                await tf.load_into_deck(tf.song_entity(URL, SONG), {'deck': value})
        self.assertEqual(self.writes, [])

    async def test_song_load_returns_destination_deck(self):
        self.states['B']['song'] = None
        result = await tf.load_into_deck(tf.song_entity(URL, SONG), {'deck': ' b '})
        self.assertEqual(result.deck, 'B')
        self.assertEqual(result.song_id, SONG['id'])
        self.assertFalse(result.playing)
        self.assertEqual(self.writes, [('/api/decks/B/songs/load', {'id': SONG['id']})])

    async def test_deck_command_failed_job_leaves_graph_unchanged(self):
        self.job_status = 'failed'
        with self.assertRaises(MaltegoException):
            await tf.stop(self.deck)
        self.assertTrue(self.deck.playing)

    async def test_icon_resources(self):
        for cls, name in ((Engine, 'engine'), (Song, 'song'), (Deck, 'deck')):
            self.assertEqual(cls.to_v3_entity_definition(cls).icon_resource, 'algorave-' + name)

    async def test_setup_name_refreshes_engine_during_navigation(self):
        await tf.to_decks(self.engine, self.context)
        self.assertEqual(self.engine.value, 'Studio Session')
        self.assertEqual(self.engine.identity, 'local-engine')
        self.assertTrue(self.engine.icon_url.endswith('Algorave_logo.png'))
        refreshed = await tf.refresh_setup(self.engine)
        self.assertIs(refreshed, self.engine)

    async def test_navigation_publishes_input_engine_updates(self):
        observer = Mock()
        context = SimpleNamespace(graph=SimpleNamespace(get_observers=lambda: [observer]))
        await tf.to_decks(self.engine, context)
        observer.update.assert_called()
        properties = [prop for call in observer.update.call_args_list
                      if call.args[1] == '_properties' for prop in call.args[2]]
        self.assertTrue(any(p.name == 'algorave.label' and p.value == 'Studio Session' for p in properties))

    async def test_overlay_positions_values_and_separate_identities(self):
        def overlays(entity):
            return {(o['position'], o['type']): o['property_name']
                    for o in entity.to_v3_run_entity().model_dump()['overlays']}
        self.assertEqual(overlays(self.deck), {('N','text'): 'algorave.deck',
                         ('NW','color'): 'algorave.colour', ('W','text'): 'algorave.bpm'})
        self.assertEqual(overlays(self.instrument), {('N','text'): 'algorave.column',
                         ('NW','color'): 'algorave.colour', ('W','text'): 'algorave.gain_display'})
        self.assertEqual(self.instrument.value, 'kick')
        self.assertEqual(self.instrument.gain_display, '65%')
        self.assertEqual(self.instrument.colour, 'green')
        await tf.mute(self.instrument)
        self.assertEqual(self.instrument.colour, 'red')
        self.assertNotEqual(self.deck.identity, tf.deck_entity(URL, self.states['B']).identity)
        self.assertEqual(Deck.to_v3_entity_definition(Deck).properties.value, 'algorave.label')

    async def test_catalogue_and_song(self):
        songs = await tf.to_songs(self.engine, self.context)
        loaded = await tf.to_song(self.deck)
        self.assertEqual(songs[0].value, loaded.value)
        self.assertEqual(songs[0].bpm, 120)

    async def test_decks_layout_and_serialization(self):
        a, b = await tf.to_decks(self.engine, self.context)
        self.assertEqual((a.colour, b.colour), ('red', 'green'))
        self.assertIn('Test Song', a.label)
        self.assertEqual(a.value, 'Test Song')
        self.assertEqual(a.bpm, 120)
        serialized = a.to_v3_run_entity().model_dump()
        self.assertTrue(serialized['overlays'])
        self.assertNotIn('test-secret', json.dumps(serialized))
        clone = Deck.from_v3_run_entity(a.to_v3_run_entity())
        self.assertEqual(clone.deck, 'A')
        self.assertEqual(clone.playing, True)
        for name, prop in a.get_properties().items():
            self.assertEqual(prop.matching_rule, 'strict' if name == 'algorave.id' else 'loose')

    async def test_instruments_and_empty_deck(self):
        instruments = await tf.to_instruments(self.deck)
        self.assertEqual(len(instruments), 2)
        self.assertFalse(instruments[1].enabled)
        self.states['A']['song'] = None
        self.assertEqual(await tf.to_instruments(self.deck), [])
        self.assertIsNone(await tf.to_song(self.deck))

    async def test_mute_unmute_are_explicit_and_preserve_draft(self):
        self.instrument.code = 's("bd*8")'
        identity = self.instrument.maltego_entity_id
        await tf.mute(self.instrument)
        self.assertTrue(self.instrument.muted)
        self.assertEqual(self.instrument.code, 's("bd*8")')
        await tf.mute(self.instrument)
        await tf.unmute(self.instrument)
        self.assertFalse(self.instrument.muted)
        self.assertEqual([body['value'] for _, body in self.writes], [1, 1, 0])
        self.assertEqual(identity, self.instrument.maltego_entity_id)
        self.assertEqual(self.polls, 3)

    async def test_update_roundtrip(self):
        serialized = self.instrument.to_v3_run_entity()
        self.instrument = Instrument.from_v3_run_entity(serialized)
        self.instrument.code = 's("bd*8")'
        result = await tf.update(self.instrument, SimpleNamespace(log=Mock()))
        self.assertEqual(result.source_hash, tf.digest('s("bd*8")'))
        self.assertEqual(result.revision, 3)
        self.assertEqual(self.writes, [('/api/decks/A/tracks/kick', {'code': 's("bd*8")'})])

    async def test_reject_stale_song_and_source(self):
        self.states['A']['song']['id'] = 'different-song'
        with self.assertRaises(MaltegoException):
            await tf.mute(self.instrument)
        self.states['A']['song']['id'] = SONG['id']
        self.states['A']['song']['tracks'][0]['code'] = 'silence'
        with self.assertRaises(MaltegoException):
            await tf.update(self.instrument, SimpleNamespace(log=Mock()))
        self.assertEqual(self.writes, [])

    async def test_failed_job_not_reported_as_applied(self):
        self.job_status = 'failed'
        with self.assertRaises(MaltegoException) as caught:
            await tf.mute(self.instrument)
        self.assertIn('Compile failed', caught.exception.message)
        self.assertFalse(self.instrument.muted)

    async def test_job_timeout(self):
        async with AlgoraveClient(URL, transport=self.transport, job_timeout=0) as api:
            with self.assertRaises(MaltegoException) as caught:
                await api.write('/api/decks/A/mixer', {'column': 1, 'parameter': 'mute', 'value': 1})
            self.assertIn('unconfirmed', caught.exception.message)

    async def test_http_error_and_redirect_do_not_forward_token(self):
        for status in (401, 409, 302):
            async with AlgoraveClient(URL, transport=httpx.MockTransport(
                lambda request: httpx.Response(status, json={'error': 'Rejected'},
                                               headers={'Location': 'http://elsewhere.invalid'}))) as api:
                with self.assertRaises(MaltegoException):
                    await api.request('GET', '/api/songs')
        with self.assertRaises(MaltegoException):
            AlgoraveClient('http://elsewhere.invalid')

    async def test_both_decks_use_their_own_channels(self):
        instrument = tf.instrument_entity(URL, self.states['B'], self.states['B']['song']['tracks'][0])
        await tf.mute(instrument)
        self.assertEqual(self.writes[0][0], '/api/decks/B/mixer')
        self.assertEqual(self.states['A']['mixerValues'][0]['mute'], 0)


if __name__ == '__main__':
    unittest.main()
