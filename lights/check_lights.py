"""Run a dim RGB check on bar 1, or a one-pass eight-bar chase."""
import argparse
import asyncio
import json
from websockets.asyncio.client import connect


async def main(args):
    async with connect(args.url, proxy=None) as ws:
        async def send(message):
            await ws.send(json.dumps(message))
            reply = json.loads(await ws.recv())
            if reply.get("type") == "error":
                raise RuntimeError(reply["message"])
            print(reply, flush=True)

        await send({"type": "status"})
        try:
            steps = [(b, [32, 0, 0]) for b in range(1, 9)] if args.chase else [(1, rgb) for rgb in [[32, 0, 0], [0, 32, 0], [0, 0, 32]]]
            for bar, rgb in steps:
                await send({"type": "bar", "bar": bar, "rgb": rgb, "exclusive": True})
                await asyncio.sleep(1)
        finally:
            await send({"type": "blackout"})


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--url", default="ws://127.0.0.1:8765")
    p.add_argument("--chase", action="store_true")
    asyncio.run(main(p.parse_args()))
