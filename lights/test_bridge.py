"""Run with the lighting virtualenv: python -m unittest discover -s lights."""
import asyncio
import json
import pathlib
import socket
import subprocess
import sys
import unittest

from websockets.asyncio.client import connect
from bridge import Lights, packet


class LayoutTests(unittest.TestCase):
    def test_reported_colours_reverse_channel_order_and_use_capped_frame(self):
        lights = Lights(bars=8, pixels=10, start=7, order="GRB", limit=32)
        lights.colour(2, [100, 20, 3])
        self.assertEqual(lights.colours()[1], [32, 20, 3])
        self.assertEqual(lights.colours()[0], [0, 0, 0])
        self.assertEqual(len(packet(lights.frame)), 518)


class MonitorTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        with socket.socket() as server:
            server.bind(("127.0.0.1", 0))
            port = server.getsockname()[1]
        self.url = f"ws://127.0.0.1:{port}"
        self.process = subprocess.Popen([sys.executable, str(pathlib.Path(__file__).with_name("bridge.py")),
                                         "--dry-run", "--port", str(port)], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        self.addAsyncCleanup(self.cleanup)
        for _ in range(100):
            try:
                self.probe = await connect(self.url)
                await self.probe.close()
                break
            except OSError:
                await asyncio.sleep(0.03)
        else:
            self.fail("Bridge did not start")

    async def cleanup(self):
        self.process.terminate()
        await asyncio.to_thread(self.process.wait, 5)
        self.process.stderr.close()

    async def colour(self, observer, rgb, timeout=3):
        async with asyncio.timeout(timeout):
            while True:
                state = json.loads(await observer.recv())
                if state.get("type") == "state" and state["colours"][0] == rgb:
                    return state

    async def test_monitor_disconnect_does_not_take_ownership_or_blackout(self):
        async with connect(self.url) as owner, connect(self.url) as observer:
            await observer.send(json.dumps({"type": "subscribe"}))
            await owner.send(json.dumps({"type": "bar", "bar": 1, "rgb": [10, 20, 30]}))
            self.assertEqual(json.loads(await owner.recv())["type"], "queued")
            state = await self.colour(observer, [10, 20, 30])
            self.assertTrue(state["dryRun"])
            self.assertFalse(state["outputConnected"])
            await observer.close()
            async with connect(self.url) as second:
                await second.send(json.dumps({"type": "subscribe"}))
                await self.colour(second, [10, 20, 30])
                await owner.close()
                await self.colour(second, [0, 0, 0])

    async def test_read_only_subscriptions_do_not_extend_the_lighting_watchdog(self):
        async with connect(self.url) as owner, connect(self.url) as observer:
            await observer.send(json.dumps({"type": "subscribe"}))
            await owner.send(json.dumps({"type": "bar", "bar": 1, "rgb": [10, 0, 0]}))
            await owner.recv()
            await self.colour(observer, [10, 0, 0])
            await self.colour(observer, [0, 0, 0])


if __name__ == "__main__":
    unittest.main()
