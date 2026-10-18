"""WebSocket endpoint for an ENTTEC DMX USB PRO and chained RGB bars."""
import argparse
import asyncio
import heapq
import json
import math
import signal
import struct
import time

import serial
from websockets.asyncio.server import serve


def packet(channels):
    payload = bytes([0]) + bytes(channels)  # DMX start code, then 512 slots
    return b"\x7e\x06" + struct.pack("<H", len(payload)) + payload + b"\xe7"


class Lights:
    def __init__(self, bars=8, pixels=10, start=1, order="RGB", limit=32):
        if bars * pixels * 3 + start - 1 > 512:
            raise ValueError("Fixture layout exceeds one DMX universe")
        self.bars, self.pixels, self.start = bars, pixels, start
        self.order, self.limit = order, limit
        self.frame = bytearray(512)

    def blackout(self):
        self.frame[:] = bytes(512)

    def colours(self, frame=None):
        frame = self.frame if frame is None else frame
        return [[frame[self.start - 1 + bar * self.pixels * 3 + self.order.index(c)]
                 for c in "RGB"] for bar in range(self.bars)]

    def colour(self, bar, rgb, exclusive=False):
        if type(bar) is not int or not 1 <= bar <= self.bars:
            raise ValueError(f"bar must be 1..{self.bars}")
        if not isinstance(rgb, list) or len(rgb) != 3:
            raise ValueError("rgb must contain three values in 0..255")
        if any(type(v) not in (int, float) or not math.isfinite(v) or not 0 <= v <= 255 for v in rgb):
            raise ValueError("rgb values must be finite numbers in 0..255")
        values = dict(zip("RGB", [min(self.limit, round(v)) for v in rgb]))
        if exclusive:
            self.blackout()
        offset = self.start - 1 + (bar - 1) * self.pixels * 3
        self.frame[offset:offset + self.pixels * 3] = bytes(values[c] for c in self.order) * self.pixels


async def main(args):
    lights = Lights(args.bars, args.pixels, args.start, args.order, args.limit)
    usb = None if args.dry_run else serial.Serial(args.device, 57600, timeout=0.2, write_timeout=0.5)
    pending = []
    sequence = 0
    last_command = time.monotonic()
    owner = None
    subscribers = set()
    last_written = bytes(512)
    frames_written = 0
    last_publish = 0
    publish_task = None
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop.set)

    def blackout():
        pending.clear()
        lights.blackout()

    def write():
        frame = bytes(lights.frame)
        if usb:
            data = packet(frame)
            if usb.write(data) != len(data):
                raise OSError("Incomplete USB write")
        return frame

    def state():
        return {"type": "state", "bars": args.bars, "pixelsPerBar": args.pixels,
                "order": args.order, "limit": args.limit, "dryRun": args.dry_run,
                "outputConnected": usb is not None, "framesWritten": frames_written,
                "colours": lights.colours(last_written)}

    async def publish():
        if subscribers:
            payload = json.dumps(state())
            await asyncio.gather(*(ws.send(payload) for ws in list(subscribers)), return_exceptions=True)

    async def handler(ws):
        nonlocal sequence, last_command, owner
        authenticated = not args.token
        try:
            async for raw in ws:
                request = {}
                try:
                    request = json.loads(raw)
                    if not isinstance(request, dict):
                        raise ValueError("Expected a JSON object")
                    kind = request.get("type")
                    if kind == "auth":
                        if request.get("token") != args.token:
                            raise ValueError("Invalid token")
                        authenticated = True
                        response = {"type": "authenticated"}
                    elif not authenticated:
                        raise ValueError("Authenticate first")
                    elif kind == "ping":
                        response = {"type": "pong", "id": request.get("id"), "serverTime": time.monotonic()}
                    elif kind == "status":
                        response = {"type": "status", "bars": args.bars, "pixelsPerBar": args.pixels,
                                    "order": args.order, "limit": args.limit, "dryRun": args.dry_run}
                    elif kind == "subscribe":
                        # Read-only: never take ownership or reset the watchdog.
                        subscribers.add(ws)
                        response = state()
                    elif kind == "unsubscribe":
                        subscribers.discard(ws)
                        response = {"type": "unsubscribed"}
                    elif kind == "blackout":
                        blackout()
                        owner = ws
                        last_command = time.monotonic()
                        response = {"type": "applied", "id": request.get("id")}
                    elif kind == "bar":
                        if owner is not None and owner is not ws:
                            raise ValueError("Another client controls the lights; disconnect it first")
                        # Validate before queuing; never mutate the active frame here.
                        check = Lights(args.bars, args.pixels, args.start, args.order, args.limit)
                        check.colour(request.get("bar"), request.get("rgb"), request.get("exclusive", False))
                        now = time.monotonic()
                        at = request.get("executeAt", now)
                        if type(at) not in (int, float) or not math.isfinite(at) or not now - 1 <= at <= now + 1:
                            raise ValueError("executeAt must be within one second of server time")
                        if len(pending) >= 512:
                            raise ValueError("Event queue full")
                        sequence += 1
                        heapq.heappush(pending, (at, sequence, request))
                        owner, last_command = ws, now
                        response = {"type": "queued", "id": request.get("id")}
                    else:
                        raise ValueError("Unknown command")
                    await ws.send(json.dumps(response))
                except (ValueError, TypeError) as exc:
                    await ws.send(json.dumps({"type": "error", "id": request.get("id") if isinstance(request, dict) else None,
                                              "message": str(exc)}))
        finally:
            subscribers.discard(ws)
            if owner is ws:
                blackout()
                owner = None

    async def output():
        nonlocal last_written, frames_written, last_publish, publish_task
        while not stop.is_set():
            now = time.monotonic()
            if now - last_command > args.watchdog:
                blackout()
            while pending and pending[0][0] <= now:
                _, _, command = heapq.heappop(pending)
                lights.colour(command["bar"], command["rgb"], command.get("exclusive", False))
            last_written = await asyncio.to_thread(write)
            frames_written += 1
            if now - last_publish >= 0.1 and (publish_task is None or publish_task.done()):
                last_publish = now
                # Monitor clients never hold up the USB output loop.
                publish_task = asyncio.create_task(publish())
            await asyncio.sleep(1 / 30)

    try:
        async with serve(handler, args.host, args.port, max_size=4096):
            print(f"Lighting bridge ws://{args.host}:{args.port} — {'simulation' if args.dry_run else args.device}", flush=True)
            task = asyncio.create_task(output())
            stopped = asyncio.create_task(stop.wait())
            await asyncio.wait([task, stopped], return_when=asyncio.FIRST_COMPLETED)
            stop.set()
            stopped.cancel()
            await task
    finally:
        if publish_task:
            publish_task.cancel()
        blackout()
        if usb:
            try:
                await asyncio.to_thread(write)
                usb.flush()
            finally:
                usb.close()


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--device", default="/dev/cu.usbserial-EN137677")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8765)
    p.add_argument("--bars", type=int, default=8)
    p.add_argument("--pixels", type=int, default=10)
    p.add_argument("--start", type=int, default=1)
    p.add_argument("--order", choices=["RGB", "RBG", "GRB", "GBR", "BRG", "BGR"], default="RGB")
    p.add_argument("--limit", type=int, default=32)
    p.add_argument("--watchdog", type=float, default=2)
    p.add_argument("--token", default=None)
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()
    if not (1 <= args.bars <= 170 and 1 <= args.pixels <= 170 and 1 <= args.start <= 512 and 0 <= args.limit <= 255):
        p.error("Invalid fixture layout or brightness limit")
    if not math.isfinite(args.watchdog) or args.watchdog <= 1:
        p.error("watchdog must exceed one second")
    if args.host not in ("127.0.0.1", "localhost", "::1") and not args.token:
        p.error("Set --token when listening beyond localhost")
    asyncio.run(main(args))
