"""Write the "Set up my league" form's answers into settings.txt.

Run by .github/workflows/setup.yml. Each answer arrives as an environment variable named
after its setting; a blank answer leaves that setting as it is.
"""
import os
import re
import sys

import settings as SETTINGS

PATH = os.path.join(SETTINGS.ROOT, 'settings.txt')
FIELDS = ['espn_league_id', 'league_name', 'brand_color', 'trim_color', 'close_games_name', 'close_game_name', 'bet_doc']
problems, changes = [], {}

for f in FIELDS:
    v = (os.environ.get(f.upper()) or '').strip()
    if not v:
        continue
    if f == 'espn_league_id':
        m = re.search(r'leagueId=(\d+)', v) or re.fullmatch(r'\s*(\d{3,})\s*', v)
        if not m:
            problems.append(f'"{v}" doesn\'t look like an ESPN league ID. Paste the digits after leagueId= in your league\'s web address, or the whole address.')
            continue
        v = m.group(1)
    elif f.endswith('_color'):
        h = v.lstrip('#')
        if not re.fullmatch(r'[0-9A-Fa-f]{6}|[0-9A-Fa-f]{3}', h):
            problems.append(f'"{v}" isn\'t a hex color. Use a code like #1F4E8C (search "color picker" to find one).')
            continue
        v = '#' + h.upper()
    elif f == 'bet_doc':
        if not SETTINGS.doc_id(v):
            problems.append(f'"{v}" doesn\'t look like a Google Doc link.')
            continue
    else:
        v = re.sub(r'\s+', ' ', v)[:60]
    changes[f] = v

if problems:
    print('\n'.join(problems))
    sys.exit(1)

lines = open(PATH, encoding='utf-8').read().split('\n') if os.path.exists(PATH) else []
seen = set()
for i, line in enumerate(lines):
    m = re.match(r'^([a-z_]+):', line.strip())
    if m and m.group(1) in changes:
        lines[i] = f'{m.group(1)}: {changes[m.group(1)]}'
        seen.add(m.group(1))
for f, v in changes.items():  # a setting missing from the file gets added at the end
    if f not in seen:
        lines.append(f'{f}: {v}')
open(PATH, 'w', encoding='utf-8').write('\n'.join(lines).rstrip('\n') + '\n')

summary = '\n'.join(f'- **{f}**: {v}' for f, v in changes.items()) or '- nothing changed'
print(summary)
if os.environ.get('GITHUB_STEP_SUMMARY'):
    with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as fh:
        fh.write('### Saved to settings.txt\n' + summary + '\n\nThe site is building now: watch the "Update the site" run.\n')
