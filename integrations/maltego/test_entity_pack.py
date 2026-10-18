import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from zipfile import ZipFile
from build_entity_pack import build


class EntityPackTests(unittest.TestCase):
    def test_icon_mapping_values_and_overlays_in_desktop_pack(self):
        with tempfile.TemporaryDirectory() as directory:
            with ZipFile(build(Path(directory) / 'entities.mtz')) as pack:
                for suffix, icon in [('engine','engine'),('decks','deck'),('song','song')]:
                    entity = ET.fromstring(pack.read(f'Entities/maltego.algorave.{suffix}.entity'))
                    self.assertEqual(entity.get('largeIconResource'), f'algorave-{icon}')
                    self.assertIn(f'Icons/Algorave/algorave-{icon}48.png', pack.namelist())
                    self.assertIn(f'Icons/Algorave/algorave-{icon}.png', pack.namelist())
                    self.assertEqual(entity.find('Properties').get('value'), 'algorave.label')
                deck = ET.fromstring(pack.read('Entities/maltego.algorave.decks.entity'))
                self.assertEqual({o.get('position') for o in deck.findall('Overlays/Overlay')}, {'N','NW','W'})
                instrument = ET.fromstring(pack.read('Entities/maltego.algorave.instrument.entity'))
                self.assertEqual(instrument.find("Overlays/Overlay[@position='W']").get('propertyName'), 'algorave.gain_display')
                self.assertFalse(any(name.endswith(('.key','.env')) for name in pack.namelist()))
