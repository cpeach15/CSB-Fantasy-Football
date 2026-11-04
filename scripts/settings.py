"""Read settings.txt (the league's settings) and work out the site's colors from it.

settings.txt is plain `name: value` lines; lines starting with # are notes and a blank
value means "use the default". Every script imports load() from here.
"""
import colorsys
import os
import re

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

DEFAULTS = {
    'espn_league_id': '',
    'league_name': '',          # blank: the name on ESPN
    'brand_color': '#1F4E8C',
    'trim_color': '#E0B04B',
    'close_games_name': 'Nail-Biters',
    'close_game_name': 'Nail-biter',
    'close_game_points': '10',
    'timezone': 'America/New_York',
    'first_season': '',
    'bet_doc': '',
}


def load(path=None):
    path = path or os.environ.get('SETTINGS_FILE') or os.path.join(ROOT, 'settings.txt')
    s = dict(DEFAULTS)
    if os.path.exists(path):
        for line in open(path, encoding='utf-8'):
            line = line.strip()
            if not line or line.startswith('#') or ':' not in line:
                continue
            k, v = line.split(':', 1)
            k, v = k.strip().lower(), v.strip()
            if v:
                s[k] = v
    return s


def doc_id(v):
    """A Google Doc link or a bare doc ID -> the ID."""
    m = re.search(r'/d/([A-Za-z0-9_-]{20,})', v or '')
    if m:
        return m.group(1)
    return v.strip() if re.fullmatch(r'[A-Za-z0-9_-]{20,}', (v or '').strip()) else ''


def close_points(s):
    try:
        return max(0.5, float(s['close_game_points']))
    except ValueError:
        return 10.0


# ---------- colors ----------
def _hex(h, fallback):
    h = (h or '').strip().lstrip('#')
    if re.fullmatch(r'[0-9A-Fa-f]{3}', h):
        h = ''.join(c * 2 for c in h)
    return '#' + (h if re.fullmatch(r'[0-9A-Fa-f]{6}', h) else fallback.lstrip('#')).upper()


def _rgb(h):
    return tuple(int(h[i:i + 2], 16) / 255 for i in (1, 3, 5))


def _to_hex(rgb):
    return '#' + ''.join(f'{max(0, min(255, round(c * 255))):02X}' for c in rgb)


def _lum(h):
    def ch(c):
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (ch(c) for c in _rgb(h))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    la, lb = sorted((_lum(a), _lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def _hls(h):
    return colorsys.rgb_to_hls(*_rgb(h))


def _from_hls(hh, l, s):
    return _to_hex(colorsys.hls_to_rgb(hh, max(0, min(1, l)), max(0, min(1, s))))


def mix(a, b, t):
    ra, rb = _rgb(a), _rgb(b)
    return _to_hex(tuple(x + (y - x) * t for x, y in zip(ra, rb)))


def palette(s):
    """brand: the header bar (white text sits on it); trim: trophies, links and 'my team' highlights on the dark page."""
    bg = '#1A222D'  # the page's panel color
    brand = _hex(s.get('brand_color'), DEFAULTS['brand_color'])
    hh, l, sat = _hls(brand)
    while contrast(brand, '#FFFFFF') < 4.5 and l > 0.05:  # keep the wordmark readable
        l -= 0.02
        brand = _from_hls(hh, l, sat)
    hh, l, sat = _hls(brand)
    deep = _from_hls(hh, l * 0.7, sat)
    hi = _from_hls(hh, min(max(l, 0.58), 0.72), min(sat, 0.75))  # accents on the dark page
    while contrast(hi, bg) < 3 and _hls(hi)[1] < 0.85:
        h2, l2, s2 = _hls(hi)
        hi = _from_hls(h2, l2 + 0.03, s2)

    trim = _hex(s.get('trim_color'), DEFAULTS['trim_color'])
    while contrast(trim, bg) < 4.5 and _hls(trim)[1] < 0.9:  # used for links and text on the dark page
        h2, l2, s2 = _hls(trim)
        trim = _from_hls(h2, l2 + 0.03, s2)
    r, g, b = (round(c * 255) for c in _rgb(trim))
    return {
        'brand': brand, 'brand_deep': deep, 'brand_hi': hi,
        'trim': trim, 'trim_soft': f'rgba({r},{g},{b},.16)', 'trim_light': mix(trim, '#FFFFFF', 0.4),
        'card_top': mix(brand, '#FFFFFF', 0.05), 'card_bottom': mix(brand, '#000000', 0.23),
    }


def public(s):
    """The settings the page itself needs (goes into the page data)."""
    return {
        'leagueId': s['espn_league_id'],
        'closeMany': s['close_games_name'], 'closeOne': s['close_game_name'],
        'closePts': close_points(s), 'tz': s['timezone'],
    }


if __name__ == '__main__':
    import json
    st = load()
    print(json.dumps({'settings': st, 'palette': palette(st)}, indent=2))
