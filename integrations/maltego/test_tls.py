import stat
import tempfile
import unittest
from pathlib import Path
from ipaddress import ip_address
from cryptography import x509
from cryptography.hazmat.primitives import serialization
from tls import create_certificate


class CertificateTests(unittest.TestCase):
    def test_valid_names_private_key_permissions_and_stable_restart(self):
        with tempfile.TemporaryDirectory() as directory:
            cert_file, key_file = create_certificate(directory)
            cert_bytes, key_bytes = cert_file.read_bytes(), key_file.read_bytes()
            cert = x509.load_pem_x509_certificate(cert_bytes)
            key = serialization.load_pem_private_key(key_bytes, password=None)
            self.assertEqual(cert.public_key().public_numbers(), key.public_key().public_numbers())
            names = cert.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
            self.assertIn('localhost', names.get_values_for_type(x509.DNSName))
            self.assertIn(ip_address('127.0.0.1'), names.get_values_for_type(x509.IPAddress))
            self.assertFalse(cert.extensions.get_extension_for_class(x509.BasicConstraints).value.ca)
            self.assertEqual(stat.S_IMODE(key_file.stat().st_mode), 0o600)
            create_certificate(directory)
            self.assertEqual(cert_bytes, cert_file.read_bytes())
            self.assertEqual(key_bytes, key_file.read_bytes())

    def test_incomplete_pair_is_not_replaced(self):
        with tempfile.TemporaryDirectory() as directory:
            Path(directory, 'server.key').write_text('existing key')
            with self.assertRaises(RuntimeError):
                create_certificate(directory)
            self.assertEqual(Path(directory, 'server.key').read_text(), 'existing key')
