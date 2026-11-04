"""Render build/results.json into the finished site.

Usage: SITE_URL=https://you.github.io/repo/ python3 scripts/build.py build/results.json _site/index.html

SITE_URL is the site's public address (the workflow gets it from GitHub Pages). Link previews
need it; without it the page still builds, just without a preview image.
"""
import hashlib
import html
import json
import os
import re
import sys
from urllib.parse import urlparse

import settings as SETTINGS

src = sys.argv[1] if len(sys.argv) > 1 else 'build/results.json'
dst = sys.argv[2] if len(sys.argv) > 2 else '_site/index.html'
R = json.load(open(src))
tpl = open(os.path.join(os.path.dirname(__file__), '..', 'site', 'template.html')).read()
ST = SETTINGS.load()
P = SETTINGS.palette(ST)
name = R['site']['name']
site_url = (os.environ.get('SITE_URL') or '').strip()
if site_url and not site_url.endswith('/'):
    site_url += '/'

first = R['seasons'][0]['year']
if R['cur']['seasonDone']:
    desc = f"The {R['current']} season is in the books. Champions, records and rivalries since {first}."
elif R['doneWeeks'] == 0:
    desc = f"The {R['current']} season is about to start. Champions, records and rivalries since {first}."
else:
    nxt = f", Week {R['previewWeek']} preview" if R.get('previewWeek') else ''
    bet = ', the weekly bet' if R.get('bets') else ''
    desc = f"Week {R['doneWeeks']} recap{nxt}{bet} and every record since {first}."

# league name and colors from settings.txt
fill = {
    '__TITLE__': html.escape(f'{name} Hall of Fame', quote=True), '__NAME__': html.escape(name, quote=True),
    '__SITE_HOST__': html.escape(urlparse(site_url).netloc or name, quote=True), '__SITE_URL__': html.escape(site_url, quote=True),
    '__BRAND_DEEP__': P['brand_deep'], '__BRAND_HI__': P['brand_hi'], '__BRAND_URL__': '%23' + P['brand'][1:],
    '__BRAND__': P['brand'], '__TRIM_SOFT__': P['trim_soft'], '__TRIM_URL__': '%23' + P['trim'][1:], '__TRIM__': P['trim'],
}
for k, v in fill.items():  # longer keys first in the dict, so __BRAND__ never eats __BRAND_DEEP__
    tpl = tpl.replace(k, v)
if not site_url:
    tpl = re.sub(r'<meta property="og:url"[^>]*>\n?', '', tpl)

# link-preview card from scripts/og.py; the version busts iMessage/Slack caches when the card changes
og = os.path.join(os.path.dirname(dst) or '.', 'og.png')
if os.path.exists(og) and site_url:
    ver = hashlib.sha1(open(og, 'rb').read()).hexdigest()[:10]
    tpl = tpl.replace('__OG_VER__', ver).replace('__OG_ALT__', html.escape(f"{name} Hall of Fame. {desc}", quote=True))
else:
    tpl = re.sub(r'<!--og-image-->.*?<!--/og-image-->\n?', '', tpl, flags=re.S)
    if os.path.exists(os.path.join(os.path.dirname(dst) or '.', 'apple-touch-icon.png')):  # keep the home-screen icons
        tpl = tpl.replace('<meta name="theme-color"', '<link rel="apple-touch-icon" href="apple-touch-icon.png">\n'
                          '<link rel="icon" type="image/png" sizes="192x192" href="icon-192.png">\n<meta name="theme-color"', 1)

data = json.dumps(R, separators=(',', ':'), ensure_ascii=False).replace('</', '<\\/')
page = tpl.replace('__OG_DESC__', html.escape(desc, quote=True)).replace('__DATA__', data)
left = sorted(set(re.findall(r'__[A-Z_]{3,}__', tpl.replace('__DATA__', '').replace('__OG_DESC__', ''))))
if left:
    print('Warning: placeholders left unfilled:', ', '.join(left))
os.makedirs(os.path.dirname(dst) or '.', exist_ok=True)
open(dst, 'w').write(page)
print(f'Wrote {dst} ({len(page) // 1024} KB): {desc}')
