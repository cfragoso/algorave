import json
import os
import unittest
from unittest.mock import patch
import httpx
from maltego.server import MaltegoException
from client import AlgoraveClient
from transforms import song_entity
import song_management as sm


class SongManagementTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.url='http://127.0.0.1:3000'
        self.saved={'id':'test-song','name':'Original','bpm':122}
        self.song=song_entity(self.url,self.saved)
        self.calls=[]
        self.env=patch.dict(os.environ,{'ALGORAVE_API_URL':self.url,'ALGORAVE_TOKEN':''})
        self.env.start();self.addCleanup(self.env.stop)
        def respond(request):
            self.calls.append((request.method,request.url.path))
            if request.method=='PATCH': self.saved['name']=json.loads(request.content)['name']
            return httpx.Response(200,json=self.saved)
        factory=patch.object(sm,'AlgoraveClient',lambda url:AlgoraveClient(url,transport=httpx.MockTransport(respond)))
        factory.start();self.addCleanup(factory.stop)

    async def test_rename_delete_restore_refresh_same_graph_node(self):
        identity=self.song.identity;node=self.song.maltego_entity_id
        await sm.rename_song(self.song,{'name':' New name '})
        self.assertEqual(self.song.value,'New name')
        await sm.delete_song(self.song,{'confirm':True})
        self.assertTrue(self.song.deleted)
        self.assertEqual(self.song.value,'New name (deleted)')
        await sm.restore_song(self.song)
        self.assertFalse(self.song.deleted)
        self.assertEqual(self.song.value,'New name')
        self.assertEqual(self.song.identity,identity);self.assertEqual(self.song.maltego_entity_id,node)
        self.assertEqual(self.calls,[('PATCH','/api/songs/test-song'),('DELETE','/api/songs/test-song'),('POST','/api/songs/test-song/restore')])

    async def test_rename_validation_and_delete_confirmation(self):
        for name in ('',None,'x'*121):
            with self.assertRaises(MaltegoException):await sm.rename_song(self.song,{'name':name})
        for confirm in (False,None,'true'):
            with self.assertRaises(MaltegoException):await sm.delete_song(self.song,{'confirm':confirm})
        self.assertEqual(self.calls,[])
