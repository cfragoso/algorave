import os
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch
import httpx
from maltego.server import MaltegoEntity, MaltegoException
from client import AlgoraveClient
import generate_transform as gt


class SongGenerationTransformTests(unittest.IsolatedAsyncioTestCase):
    async def test_transform_uses_shared_generation_api_without_deck_changes(self):
        calls = []
        def respond(request):
            import json
            calls.append((request.method, request.url.path, json.loads(request.content)))
            return httpx.Response(201, json={'id':'generated-test','name':'Dark trance 140 BPM','bpm':140,'generation':{'genre':'trance'}})
        with patch.dict(os.environ, {'ALGORAVE_API_URL':'http://127.0.0.1:3000','ALGORAVE_TOKEN':''}), patch.object(
            gt, 'AlgoraveClient', lambda url: AlgoraveClient(url, transport=httpx.MockTransport(respond))):
            result = await gt.generate(MaltegoEntity['maltego.Phrase']('Dark trance 140 BPM'), SimpleNamespace(log=Mock()))
            self.assertEqual(result.value, 'Dark trance 140 BPM')
            self.assertEqual(result.bpm, 140)
        self.assertEqual(calls, [('POST','/api/songs/generate',{'phrase':'Dark trance 140 BPM'})])

    async def test_empty_phrase_is_rejected_before_network(self):
        with patch.object(gt, 'AlgoraveClient') as client:
            with self.assertRaises(MaltegoException):
                await gt.generate(MaltegoEntity['maltego.Phrase'](' '), SimpleNamespace(log=Mock()))
            client.assert_not_called()

    async def test_save_failure_does_not_return_song(self):
        with patch.dict(os.environ, {'ALGORAVE_API_URL':'http://127.0.0.1:3000'}), patch.object(
            gt, 'AlgoraveClient', lambda url: AlgoraveClient(url, transport=httpx.MockTransport(
                lambda request: httpx.Response(401,json={'error':'API token required'})))):
            with self.assertRaises(MaltegoException):
                await gt.generate(MaltegoEntity['maltego.Phrase']('Trance'), SimpleNamespace(log=Mock()))
