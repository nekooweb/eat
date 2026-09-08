#!/usr/bin/env python3
import json
import math
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

CENTER_LAT = 35.6959
CENTER_LNG = 139.7576
RADIUS_M = 1200
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data' / 'area1_osm.js'
SOURCE_FILES = [
    ROOT / 'data' / 'restaurants.js',
    ROOT / 'data' / 'area1_bulk.js',
    ROOT / 'data' / 'area1_more.js',
]
ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.nchc.org.tw/api/interpreter',
]
CUISINE_MAP = {
    'japanese': '日式', 'sushi': '寿司', 'ramen': '拉面', 'noodle': '面食',
    'udon': '乌冬', 'soba': '荞麦面', 'tempura': '天妇罗', 'yakitori': '烧鸟',
    'yakiniku': '烤肉', 'tonkatsu': '炸猪排', 'curry': '咖喱', 'indian': '印度菜',
    'nepalese': '尼泊尔菜', 'thai': '泰国菜', 'vietnamese': '越南菜',
    'korean': '韩国菜', 'chinese': '中华', 'taiwanese': '台湾菜',
    'italian': '意大利菜', 'pizza': '披萨', 'french': '法餐', 'spanish': '西班牙菜',
    'burger': '汉堡', 'american': '美式', 'steak_house': '牛排', 'seafood': '海鲜',
    'donburi': '盖饭', 'gyoza': '饺子', 'hotpot': '锅物', 'barbecue': '烧烤',
    'coffee_shop': '咖啡', 'dessert': '甜品', 'cake': '甜品', 'ice_cream': '甜品',
}
PRACTICAL_SOURCE_TAGS = (
    'payment:credit_cards',
    'payment:visa',
    'payment:mastercard',
    'payment:jcb',
    'payment:american_express',
    'payment:diners_club',
    'internet_access',
    'wheelchair',
    'smoking',
)


def haversine(a, b, c, d):
    radius = 6371000
    a1, a2 = math.radians(a), math.radians(c)
    da = math.radians(c - a)
    do = math.radians(d - b)
    value = math.sin(da / 2) ** 2 + math.cos(a1) * math.cos(a2) * math.sin(do / 2) ** 2
    return radius * 2 * math.atan2(math.sqrt(value), math.sqrt(1 - value))


def norm(value):
    return re.sub(r'[\s　・\-—_]+', '', value or '').lower()


def curated_names():
    names = set()
    pattern = re.compile(r"name:'([^']+)'|name:\"([^\"]+)\"")
    for path in SOURCE_FILES:
        if not path.exists():
            continue
        for match in pattern.finditer(path.read_text(encoding='utf-8')):
            names.add(norm(match.group(1) or match.group(2)))
    return names


def fetch_overpass():
    # Keep the independent OSM candidate universe aligned with the repository's
    # Google food-business scope. `out center tags` retains all public OSM tags;
    # the serializer below keeps selected native website/phone/practical metadata
    # without treating any of those fields as identity proof.
    query = f'''[out:json][timeout:180];(
 nwr(around:{RADIUS_M},{CENTER_LAT},{CENTER_LNG})["amenity"~"^(restaurant|fast_food|cafe|food_court|bar|pub|biergarten|ice_cream)$"]["name"];
 nwr(around:{RADIUS_M},{CENTER_LAT},{CENTER_LNG})["shop"~"^(bakery|pastry|confectionery|deli|coffee|tea|ice_cream)$"]["name"];
 );out center tags;'''
    data = urllib.parse.urlencode({'data': query}).encode()
    last = None
    for endpoint in ENDPOINTS:
        try:
            request = urllib.request.Request(
                endpoint,
                data=data,
                headers={'User-Agent': 'nekooweb-eat-static-builder/2.4'},
            )
            return json.loads(urllib.request.urlopen(request, timeout=210).read().decode())
        except Exception as error:
            last = error
            time.sleep(3)
    raise RuntimeError(last)


def cuisine_for(tags):
    raw = (tags.get('cuisine') or '').lower().replace(',', ';')
    for token in [item.strip() for item in raw.split(';') if item.strip()]:
        if token in CUISINE_MAP:
            return CUISINE_MAP[token]
        for key, value in CUISINE_MAP.items():
            if key in token:
                return value
    if tags.get('amenity') == 'cafe' or tags.get('shop') in {'coffee', 'tea'}:
        return '咖啡'
    if tags.get('amenity') == 'fast_food':
        return '快餐'
    if tags.get('amenity') in {'bar', 'pub', 'biergarten'}:
        return '酒吧'
    if tags.get('amenity') == 'ice_cream' or tags.get('shop') == 'ice_cream':
        return '甜品'
    if tags.get('shop') in {'bakery', 'pastry'}:
        return '面包・烘焙'
    if tags.get('shop') == 'confectionery':
        return '甜品'
    return '餐厅'


def address(tags):
    keys = [
        'addr:province', 'addr:city', 'addr:suburb', 'addr:quarter',
        'addr:neighbourhood', 'addr:street', 'addr:housenumber',
    ]
    return ' '.join(dict.fromkeys(value for key in keys if (value := tags.get(key))))


def source_websites(tags):
    """Retain public OSM website tags as source metadata, never as identity proof."""
    output = []
    for key in ('contact:website', 'website'):
        raw = str(tags.get(key) or '').strip()
        if not raw:
            continue
        for value in re.split(r'\s*;\s*', raw):
            value = value.strip()
            if not re.match(r'^https?://', value, re.I):
                continue
            if value not in output:
                output.append(value)
    return output[:4]


def source_phones(tags):
    """Retain source-native OSM phone strings without inferring or reformatting them."""
    output = []
    seen_digits = set()
    for key in ('contact:phone', 'phone'):
        raw = str(tags.get(key) or '').strip()
        if not raw:
            continue
        for value in re.split(r'\s*;\s*', raw):
            value = value.strip()
            if not value or len(value) > 80:
                continue
            digits = re.sub(r'\D', '', value)
            if not (8 <= len(digits) <= 15) or digits in seen_digits:
                continue
            seen_digits.add(digits)
            output.append(value)
    return output[:4]


def source_practical_tags(tags):
    """Retain explicit OSM practical tags for later exact-binding resolution.

    This serializer does not itself map tags to canonical values. Downstream resolvers
    accept only conservative semantics: explicit credit-card support, Wi-Fi/no internet,
    wheelchair yes/no, and recognized smoking-policy values. Ambiguous values remain
    retained provenance and are never promoted automatically.
    """
    output = {}
    for key in PRACTICAL_SOURCE_TAGS:
        raw = str(tags.get(key) or '').strip()
        if raw:
            output[key] = raw[:80]
    return output


def main():
    existing = curated_names()
    raw = fetch_overpass()
    output = []
    seen = set()
    overlap_count = 0
    website_rows = 0
    website_values = 0
    phone_rows = 0
    phone_values = 0
    practical_rows = 0
    practical_tag_values = 0

    for element in raw.get('elements', []):
        tags = element.get('tags') or {}
        name = (tags.get('name:ja') or tags.get('name') or '').strip()
        lat = element.get('lat') or (element.get('center') or {}).get('lat')
        lng = element.get('lon') or (element.get('center') or {}).get('lon')
        if not name or lat is None or lng is None:
            continue
        distance = haversine(CENTER_LAT, CENTER_LNG, float(lat), float(lng))
        entity = (norm(name), round(float(lat), 4), round(float(lng), 4))
        if distance > RADIUS_M + 5 or entity in seen:
            continue
        seen.add(entity)
        cuisine = cuisine_for(tags)
        opening = tags.get('opening_hours') or None
        overlap = norm(name) in existing
        websites = source_websites(tags)
        phones = source_phones(tags)
        practical_tags = source_practical_tags(tags)
        if overlap:
            overlap_count += 1
        if websites:
            website_rows += 1
            website_values += len(websites)
        if phones:
            phone_rows += 1
            phone_values += len(phones)
        if practical_tags:
            practical_rows += 1
            practical_tag_values += len(practical_tags)

        # Keep curated-name overlaps instead of excluding them. They are useful
        # independent identity bridges. Website/phone/practical values remain source
        # metadata; Google status stays pending and no identity is promoted here.
        output.append({
            'id': 'osm-' + element.get('type', 'x')[0] + '-' + str(element.get('id')),
            'profile': 'TOKYO',
            'area': '地区1️⃣',
            'name': name,
            'cuisine': cuisine,
            'tags': [cuisine],
            'distance': int(round(distance / 50) * 50),
            'distanceMeters': int(round(distance)),
            'lunch': None,
            'dinner': None,
            'dishes': [],
            'openingHoursRaw': opening,
            'closedDays': [],
            'address': address(tags),
            'lat': round(float(lat), 6),
            'lng': round(float(lng), 6),
            'sourceWebsites': websites,
            'sourcePhones': phones,
            'sourcePracticalTags': practical_tags,
            'googlePlaceId': None,
            'googleStatus': 'pending',
            'source': 'OpenStreetMap',
            'sourceId': f"{element.get('type', 'x')}/{element.get('id')}",
            'curatedOverlap': overlap,
            'hyakumeiten': False,
            'randomWeight': 1,
        })

    output.sort(key=lambda item: (item['distanceMeters'], item['name']))
    OUT.write_text(
        '// Auto-generated candidate pool. Google business identity must be verified before promotion.\n'
        'window.RESTAURANTS.push(\n'
        + ',\n'.join(json.dumps(row, ensure_ascii=False, separators=(',', ':')) for row in output)
        + '\n);\n',
        encoding='utf-8',
    )
    print(json.dumps({
        'generatedCandidates': len(output),
        'curatedOverlaps': overlap_count,
        'rowsWithSourceWebsites': website_rows,
        'sourceWebsiteValues': website_values,
        'rowsWithSourcePhones': phone_rows,
        'sourcePhoneValues': phone_values,
        'rowsWithSourcePracticalTags': practical_rows,
        'sourcePracticalTagValues': practical_tag_values,
        'googleStatus': 'pending',
        'identityPromotions': 0,
    }, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main())