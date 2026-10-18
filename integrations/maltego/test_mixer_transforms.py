import copy
import json
import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch
import httpx
from maltego.server import MaltegoException
from client import AlgoraveClient
from entities import Engine
import mixer_transforms as mt


class MixerTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.url = 'http://127.0.0.1:3000'
        env = patch.dict(os.environ, {'ALGORAVE_API_URL': self.url, 'ALGORAVE_TOKEN': ''})
        env.start(); self.addCleanup(env.stop)
        self.state = {'crossfader': .5, 'master': .7, 'sinkId': 'saved-output',
                      'channels': {deck: {'volume': .8, 'high': 0, 'mid': 0, 'low': 0} for deck in ('A','B')}}
        self.writes = []
        self.status = 'applied'
        transport = httpx.MockTransport(self.respond)
        factory = patch.object(mt, 'AlgoraveClient', lambda url: AlgoraveClient(url, transport=transport))
        factory.start(); self.addCleanup(factory.stop)
        self.mixer = mt.mixer_entity(self.url, self.state)
        self.a = mt.channel_entity(self.url, self.state, 'A')
        self.b = mt.channel_entity(self.url, self.state, 'B')

    def respond(self, request):
        if request.method == 'PATCH':
            self.assertEqual(request.url.path, '/api/mixer')
            data = json.loads(request.content); self.writes.append(data)
            if self.status == 'applied':
                for key, value in data.items():
                    if key == 'channels':
                        for deck, channel in value.items(): self.state['channels'][deck].update(channel)
                    else: self.state[key] = value
            return httpx.Response(202, json={'id': 'mix-job', 'status': 'pending'})
        if request.url.path.startswith('/api/jobs/'):
            return httpx.Response(200, json={'id': 'mix-job', 'status': self.status, 'error': 'Mixer unavailable'})
        if request.url.path == '/api/session/state':
            return httpx.Response(200, json={'mixer': self.state, 'setup': {'name': 'Test Setup'}})
        return httpx.Response(200, json=self.state)

    async def test_engine_mixer_channels(self):
        engine = Engine('Engine')
        result = await mt.to_mixer(engine, SimpleNamespace(graph=SimpleNamespace(get_observers=lambda: [])))
        self.assertEqual(engine.value, 'Test Setup')
        channels = await mt.to_channels(result)
        self.assertEqual([c.deck for c in channels], ['A','B'])
        self.assertNotEqual(channels[0].identity, channels[1].identity)

    async def test_crossfader_positions_are_global(self):
        for position, value in [('left',0), ('middle',.5), ('right',1)]:
            result = await mt.crossfader(self.a, {'position': position})
            self.assertEqual(result.crossfader, value)
            self.assertEqual(self.state['crossfader'], value)
        self.assertEqual(self.state['sinkId'], 'saved-output')

    async def test_channel_volume_and_master_are_independent(self):
        await mt.channel_volume(self.b, {'volume': 34})
        self.assertEqual(self.state['channels']['B']['volume'], .34)
        self.assertEqual(self.state['channels']['A']['volume'], .8)
        await mt.master_volume(self.mixer, {'volume': 51})
        self.assertEqual(self.mixer.master, .51)
        await mt.master_volume(self.a, {'volume': 100})
        self.assertEqual(self.a.master, 1)
        self.assertEqual(self.state['channels']['B']['volume'], .34)

    async def test_eq_targets_only_requested_band_and_channel(self):
        await mt.high_eq(self.a, {'db': 12})
        await mt.mid_eq(self.b, {'db': -24})
        await mt.low_eq(self.a, {'db': -3.5})
        self.assertEqual(self.state['channels']['A'], {'volume':.8,'high':12,'mid':0,'low':-3.5})
        self.assertEqual(self.state['channels']['B']['mid'], -24)
        self.assertEqual(self.state['channels']['B']['high'], 0)

    async def test_invalid_settings_and_channel_do_not_write(self):
        for value in (-25,13,'nan',None,True):
            with self.assertRaises(MaltegoException): await mt.high_eq(self.a, {'db':value})
        for value in (-1,101,1.5,True,None):
            with self.assertRaises(MaltegoException): await mt.master_volume(self.mixer, {'volume':value})
        with self.assertRaises(MaltegoException): await mt.crossfader(self.b, {'position':'center'})
        self.a.deck = 'C'
        with self.assertRaises(MaltegoException): await mt.channel_volume(self.a, {'volume':50})
        self.assertEqual(self.writes, [])

    async def test_failed_acknowledgement_does_not_refresh_entity(self):
        self.status = 'failed'
        with self.assertRaises(MaltegoException): await mt.channel_volume(self.b, {'volume':0})
        self.assertEqual(self.b.volume, .8)
