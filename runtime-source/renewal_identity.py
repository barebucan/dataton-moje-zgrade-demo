"""Address-only identity helpers; house suffixes, ranges and unit slashes remain meaningful."""
import re
from spatial_api import norm
HOUSE=re.compile(r'(\d+[A-Za-zČĆĐŠŽčćđšž]*(?:\s*[-/]\s*\d+[A-Za-zČĆĐŠŽčćđšž]*)*(?:\s+[A-Za-zČĆĐŠŽčćđšž])?)\s*\.?$')
def house_number(value):
 m=HOUSE.search(value or '')
 return m.group(1) if m else None

def house_key(value):return re.sub(r'\s+','',norm(value or '')).rstrip('.')
def address_key(value):
 text=norm(value or '').strip();match=HOUSE.search(text)
 street=text[:match.start()] if match else text
 street=' '.join(w for w in re.findall(r'\w+',street) if w not in ['ulica','ul','avenija','av'])
 return street+'|'+(house_key(match.group(1)) if match else '')


def validate_heritage_polygon(source_dir, connection, oid, tags, evidence):
    """Check a reviewed named building against the Ministry's saved designation."""
    import hashlib
    import json
    from shapely.geometry import shape

    assert oid == evidence['oid']
    assert tags.get('name') == evidence['osm_name']
    assert tags.get('building') == evidence['osm_building']
    payload = (source_dir / f'mkm-heritage-{oid}.json').read_bytes()
    assert hashlib.sha256(payload).hexdigest() == evidence['sha256']
    document = json.loads(payload)
    features = [
        feature for feature in document['features']
        if feature['properties'].get('kd_reg_br', feature['properties'].get('registarski_broj')) == evidence['registration']
    ]
    assert len(features) == 1
    geometry = connection.execute('select geometry from buildings where oid=?', (oid,)).fetchone()[0]
    outline = shape(json.loads(geometry))
    designated_area = shape(features[0]['geometry'])
    crs = document.get('crs', {}).get('properties', {}).get('name', '')
    if crs.endswith('::3765'):
        from pyproj import Transformer
        from shapely import transform

        to_wgs84 = Transformer.from_crs(3765, 4326, always_xy=True)
        designated_area = transform(designated_area, to_wgs84.transform, interleaved=False)
    if evidence.get('exclusive_outline'):
        # The designated area can include a garden or yard. Require a dominant
        # footprint with no competing building substantially inside the area.
        assert designated_area.intersection(outline).area >= 0.90 * outline.area
        west, south, east, north = designated_area.bounds
        candidates = connection.execute(
            'select b.oid,b.geometry from spatial s join buildings b on b.id=s.id '
            'where s.minx<=? and s.maxx>=? and s.miny<=? and s.maxy>=?',
            (east, west, north, south),
        )
        for other_oid, geometry in candidates:
            if other_oid != oid:
                other = shape(json.loads(geometry))
                if other.area:
                    assert designated_area.intersection(other).area < 0.05 * other.area, other_oid
    else:
        assert designated_area.intersection(outline).area >= 0.97 * outline.area


def reviewed_hks_outline(source_dir, connection, record):
    """Validate an outline identified on the conservator's labelled campus plan."""
    import hashlib
    import json

    evidence = json.loads((source_dir / 'hks-conservation-identity.json').read_text())
    building = evidence['buildings'][record['source_id']]
    assert address_key(record['address']) == address_key(building['address'])
    oid = building['oid']
    geometry = connection.execute('select geometry from buildings where oid=?', (oid,)).fetchone()[0]
    assert hashlib.sha256(geometry.encode()).hexdigest() == building['geometry_sha256']
    return oid


def reviewed_outline_oid(evidence):
    if dkp := evidence.get('dkp'):
        return 'dkp' + dkp['id'].removeprefix('ZGRADE.')
    return 'zt' + evidence['city_topographic']['id'].removeprefix('HR.ZAGREB:')
