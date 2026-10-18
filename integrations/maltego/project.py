"""Run from this directory: .venv/bin/python project.py"""
import os
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).with_name('.env'))

import transforms  # noqa: F401 — registers entities and transforms
import mixer_transforms  # noqa: F401
from maltego.server import MaltegoServerSettings, run_server
from tls import create_certificate

if __name__ == '__main__':
    cert_file = os.getenv('ALGORAVE_TLS_CERT')
    key_file = os.getenv('ALGORAVE_TLS_KEY')
    if bool(cert_file) != bool(key_file):
        raise SystemExit('Set both ALGORAVE_TLS_CERT and ALGORAVE_TLS_KEY, or neither.')
    if not cert_file:
        cert_file, key_file = create_certificate(Path(__file__).with_name('.local'))
    run_server(host='127.0.0.1', port=int(os.getenv('ALGORAVE_TRANSFORMS_PORT', '8081')),
               ssl=True, ssl_cert_file=str(cert_file), ssl_key_file=str(key_file),
               settings=MaltegoServerSettings(
                   server_name='Algorave', ns='algorave', author='cfragoso',
                   transform_execution_timeout=45))
