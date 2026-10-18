"""Run from this directory: .venv/bin/python project.py"""
import os
from dotenv import load_dotenv
load_dotenv()

import transforms  # noqa: F401 — registers entities and transforms
from maltego.server import MaltegoServerSettings, run_server

if __name__ == '__main__':
    run_server(host='127.0.0.1', port=int(os.getenv('ALGORAVE_TRANSFORMS_PORT', '8081')),
               ssl=False, settings=MaltegoServerSettings(
                   server_name='Algorave', ns='algorave', author='cfragoso',
                   transform_execution_timeout=45))
