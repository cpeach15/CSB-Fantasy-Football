// Usage: node scripts/fetch.js data/league.json
// Pulls the league from ESPN and writes the compact data file the site is built from.
// The league comes from settings.txt; ESPN_S2 and SWID (repository secrets) are only needed for a private league.
const fs = require('fs');
const path = require('path');
const { buildData } = require('./espn.js');

const out = process.argv[2] || 'data/league.json';

// settings.txt: "name: value" lines, # for notes (same reader as scripts/settings.py)
function settings() {
  const s = {};
  const file = process.env.SETTINGS_FILE || path.join(__dirname, '..', 'settings.txt');
  if (!fs.existsSync(file)) return s;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes(':')) continue;
    const i = line.indexOf(':');
    const v = line.slice(i + 1).trim();
    if (v) s[line.slice(0, i).trim().toLowerCase()] = v;
  }
  return s;
}

// print a problem and keep it in build/alerts.txt for the Slack alert
function alert(msg) {
  console.error(msg);
  try { fs.mkdirSync('build', { recursive: true }); fs.appendFileSync('build/alerts.txt', msg + '\n'); } catch (e) { /* best effort */ }
}

const S = settings();
const LEAGUE_ID = (process.env.LEAGUE_ID || S.espn_league_id || '').replace(/\D/g, '');
const FIRST = parseInt(S.first_season, 10) || 0;
const S2 = (process.env.ESPN_S2 || '').trim();
const SWID = (process.env.SWID || '').trim();

if (!LEAGUE_ID) {
  alert('No ESPN league ID yet. Run "Set up my league" under the Actions tab, or fill in espn_league_id in settings.txt.');
  process.exit(1);
}
if (!!S2 !== !!SWID) {
  alert('Only one of the ESPN_S2 / SWID secrets is set. Add both (Settings > Secrets and variables > Actions), or remove both for a public league.');
  process.exit(1);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getJSON(url, headers = {}) {
  for (let attempt = 1; ; attempt++) {
    const r = await fetch(url, {
      headers: {
        ...headers,
        ...(S2 ? { Cookie: `espn_s2=${S2}; SWID=${SWID}` } : {}),
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (fantasy hall of fame weekly build)'
      }
    });
    if (r.ok) return r.json();
    if (r.status === 401 || r.status === 403) {
      const e = new Error(S2
        ? `ESPN refused the request (${r.status}). The ESPN_S2 / SWID cookies have probably expired; copy fresh ones from espn.com and update the two secrets.`
        : `ESPN says league ${LEAGUE_ID} is private (${r.status}). Either add the ESPN_S2 and SWID secrets, or have the commissioner turn on "Make league viewable to public" in the ESPN league settings.`);
      e.status = r.status; throw e;
    }
    if (r.status === 404 || attempt >= 4) {
      const e = new Error(`ESPN returned ${r.status} for ${url}`); e.status = r.status; throw e;
    }
    await sleep(1500 * attempt);
  }
}

(async () => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: S.timezone || 'America/New_York' });
  const D = await buildData(getJSON, { leagueId: LEAGUE_ID, today, firstSeason: FIRST, warn: alert });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(D) + '\n');
  console.log(`Saved ${out}: ${D.league}, season ${D.current}, ${D.doneWeeks} weeks complete, ${Object.keys(D.seasons).length} seasons.`);
})().catch(e => {
  const msg = e.message || String(e);
  alert(/Could not find a current season/.test(msg)
    ? `ESPN has no league ${LEAGUE_ID} for this year or last. Check espn_league_id in settings.txt (the digits after leagueId= in the league's web address).`
    : msg);
  process.exit(1);
});
