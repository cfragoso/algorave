"""Bounded, authenticated API requests; writes wait for the audio player's acknowledgement."""
import asyncio
import os
import time
from urllib.parse import urlsplit, quote

import httpx
from maltego.server import MaltegoException


class AlgoraveClient:
    def __init__(self, engine_url=None, transport=None, job_timeout=20):
        configured = os.getenv('ALGORAVE_API_URL', 'http://127.0.0.1:3000').rstrip('/')
        self.url = (engine_url or configured).rstrip('/')
        parts = urlsplit(self.url)
        if (self.url != configured or parts.scheme not in ('http', 'https') or
                not parts.hostname or parts.username or parts.password or parts.query or parts.fragment):
            raise MaltegoException('Engine URL must match ALGORAVE_API_URL configured on the transform service.')
        token = os.getenv('ALGORAVE_TOKEN', '')
        self.http = httpx.AsyncClient(base_url=self.url + '/', timeout=10, follow_redirects=False,
                                      headers={'Authorization': f'Bearer {token}'} if token else {},
                                      transport=transport, trust_env=False)
        self.job_timeout = job_timeout

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        await self.http.aclose()

    async def request(self, method, path, data=None):
        try:
            response = await self.http.request(method, path.lstrip('/'), json=data)
        except httpx.HTTPError:
            raise MaltegoException('Cannot reach the Algorave API. Check the app, URL and network. '
                                   'If this was a write, inspect the deck before retrying.') from None
        try:
            payload = response.json()
        except ValueError:
            raise MaltegoException('Algorave returned an invalid API response.') from None
        if not response.is_success:
            message = payload.get('error', 'Request rejected') if isinstance(payload, dict) else 'Request rejected'
            raise MaltegoException(f'Algorave HTTP {response.status_code}: {message}')
        return payload

    async def state(self, deck):
        if deck not in ('A', 'B'):
            raise MaltegoException('Deck must be A or B. Extract fresh deck entities from the engine.')
        return await self.request('GET', f'/api/decks/{deck}/state')

    async def write(self, path, data, method='PATCH'):
        job = await self.request(method, path, data)
        job_id = job.get('id')
        if not job_id:
            raise MaltegoException('API did not return an acknowledgement job. Inspect the deck before retrying.')
        deadline = time.monotonic() + self.job_timeout
        while True:
            if job.get('status') == 'applied':
                return job
            if job.get('status') == 'failed':
                raise MaltegoException(f"Algorave rejected job {job_id}: {job.get('error', 'unknown error')}")
            if time.monotonic() >= deadline:
                raise MaltegoException(f'Job {job_id} is still unconfirmed. Inspect /api/jobs/{job_id} before retrying.')
            await asyncio.sleep(.15)
            job = await self.request('GET', '/api/jobs/' + quote(job_id, safe=''))
