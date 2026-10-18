"""Build a desktop entity/icon import pack to replace stale cached definitions."""
from pathlib import Path
import xml.etree.ElementTree as ET
from zipfile import ZipFile, ZIP_DEFLATED

from entities import Engine, Song, Deck, Instrument
from maltego.server import _server


def xml_bytes(root):
    ET.indent(root)
    return ET.tostring(root, encoding='utf-8', xml_declaration=True)


def entity_xml(cls):
    definition = cls.to_v3_entity_definition(cls).model_dump(by_alias=True, exclude_none=True)
    root = ET.Element('MaltegoEntity', {
        'id': definition['id'], 'displayName': definition['displayName'],
        'displayNamePlural': definition['displayNamePlural'], 'description': definition['description'],
        'category': definition['category'], 'smallIconResource': definition['iconResource'],
        'largeIconResource': definition['iconResource'], 'allowedRoot': str(definition['allowedRoot']).lower(),
        'conversionOrder': str(definition['conversionOrder']), 'visible': 'true'})
    properties = ET.SubElement(root, 'Properties', value='algorave.label', displayValue='algorave.label')
    ET.SubElement(properties, 'Groups')
    fields = ET.SubElement(properties, 'Fields')
    for source in definition['properties']['fields']:
        attrs = {key: str(source[key]).lower() if isinstance(source[key], bool) else str(source[key])
                 for key in ('name','displayName','description','nullable','hidden','readonly','matchingRule')
                 if key in source}
        attrs['type'] = {'STRING':'string','DOUBLE':'double','INT':'int','BOOLEAN':'boolean'}.get(source['type'], source['type'].lower())
        field = ET.SubElement(fields, 'Field', attrs)
        if 'defaultValue' in source:
            ET.SubElement(field, 'DefaultValue').text = str(source['defaultValue'])
        ET.SubElement(field, 'SampleValue')
    if definition['overlays']:
        overlays = ET.SubElement(root, 'Overlays')
        for overlay in definition['overlays']:
            ET.SubElement(overlays, 'Overlay', overlay)
    return xml_bytes(root)


def build(destination):
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(destination, 'w', ZIP_DEFLATED) as archive:
        for cls in (Engine, Song, Deck, Instrument):
            archive.writestr(f'Entities/{cls.TYPE_NAME}.entity', entity_xml(cls))
        # SDK-generated icon sizes use the same layout as Desktop's entity exports.
        for name, icon in _server.paired_config.icons.items():
            base = f"Icons/{icon['category']}/{name}"
            archive.writestr(base + '.xml', b'<Icon><Aliases/></Icon>')
            for size, data in icon['data'].items():
                archive.writestr(base + ('' if size == 16 else str(size)) + '.png', data)
    return destination


if __name__ == '__main__':
    print(build(Path(__file__).with_name('desktop') / 'algorave-entities.mtz'))
