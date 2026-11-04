// Pulls an ESPN fantasy football league's full history into one compact JSON object.
// Transport is injected (getJSON) so the same code runs in Node (cookies from env) or a signed-in browser.
// opts: { leagueId, today, season?, firstSeason?, warn?(msg) }
async function buildData(getJSON, opts) {
  const LID = opts.leagueId;
  const base = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl';
  const r1 = x => Math.round(x * 10) / 10;
  const r2 = x => x == null ? null : Math.round(x * 100) / 100;
  const POS = { 1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'K', 7: 'P', 9: 'DT', 10: 'DE', 11: 'LB', 12: 'CB', 13: 'S', 14: 'HC', 16: 'D/ST' };
  const warn = opts.warn || (() => {});
  const qs = views => views.map(v => 'view=' + v).join('&');
  const get = (y, views, extra = '', headers) =>
    getJSON(`${base}/seasons/${y}/segments/0/leagues/${LID}?${qs(views)}${extra}`, headers);
  // ESPN keeps seasons before 2018 behind a separate history endpoint that answers with a one-item list
  const getAny = async (y, views, extra = '', headers) => {
    if (y >= 2018) return get(y, views, extra, headers);
    const j = await getJSON(`${base}/leagueHistory/${LID}?seasonId=${y}&${qs(views)}${extra}`, headers);
    return Array.isArray(j) ? j[0] : j;
  };

  // ---- which season is current ----
  let cur = opts.season, status;
  if (!cur) {
    const yr = new Date(opts.today + 'T12:00:00Z').getUTCFullYear();
    for (const y of [yr, yr - 1]) {
      try { const j = await get(y, ['mStatus']); if (j && j.status) { cur = y; status = j.status; break; } } catch (e) { if (e.status !== 404) throw e; }
    }
    if (!cur) throw new Error('Could not find a current season for league ' + LID);
  }
  if (!status) status = (await get(cur, ['mStatus'])).status;
  const asked = [...(status.previousSeasons || []).filter(y => y >= (opts.firstSeason || 0)), cur];

  // ---- every season: teams, schedule, draft ----
  // A past season ESPN won't serve is skipped with a note rather than sinking the whole update.
  const H = {}, seasons = [];
  for (const y of asked) {
    let j;
    try {
      j = await getAny(y, ['mTeam', 'mSettings', 'mMatchupScore', 'mDraftDetail', 'mStatus']);
      if (!j || !j.settings || !(j.teams || []).length) throw new Error('no league data');
    } catch (e) {
      if (y === cur || e.status === 401 || e.status === 403) throw e;
      warn(`ESPN didn't return the ${y} season (${e.message}), so the site leaves it out. To skip it quietly, set first_season in settings.txt.`);
      continue;
    }
    seasons.push(y);
    const members = (j.members || []).map(m => ({ id: m.id, fn: m.firstName, ln: m.lastName }));
    const teams = (j.teams || []).map(t => ({
      id: t.id, name: (t.name || ((t.location || '') + ' ' + (t.nickname || ''))).trim(), primary: t.primaryOwner,
      abbrev: (t.abbrev || '').trim(), logo: /^https?:\/\//.test(t.logo || '') ? t.logo : '',
      rank: t.rankCalculatedFinal, seed: t.playoffSeed,
      w: t.record && t.record.overall.wins, l: t.record && t.record.overall.losses, tie: t.record && t.record.overall.ties,
      pf: t.record && t.record.overall.pointsFor, pa: t.record && t.record.overall.pointsAgainst,
      moves: t.transactionCounter && { acq: t.transactionCounter.acquisitions, trades: t.transactionCounter.trades }
    }));
    const sch = (j.schedule || []).map(m => [m.matchupPeriodId, m.home && m.home.teamId, m.home && m.home.totalPoints,
      m.away ? m.away.teamId : null, m.away ? m.away.totalPoints : null, m.winner, m.playoffTierType]);
    const picks = ((j.draftDetail && j.draftDetail.picks) || []).map(p => [p.roundId, p.overallPickNumber, p.teamId, p.playerId]);
    const ss = j.settings.scheduleSettings;
    const slots = j.settings.rosterSettings && j.settings.rosterSettings.lineupSlotCounts;
    H[y] = { members, teams, sch, picks, regWeeks: ss.matchupPeriodCount, playoffTeams: ss.playoffTeamCount, name: j.settings.name,
      slots, done: teams.length > 0 && teams.every(t => t.rank > 0) };
  }

  // ---- drafted players: name, position, season points, preseason projection ----
  for (const y of seasons) {
    const ids = [...new Set(H[y].picks.map(p => p[3]))];
    H[y].pl = {};
    if (!ids.length) continue;
    let j;
    try {
      j = await getAny(y, ['kona_player_info'], '', { 'X-Fantasy-Filter': JSON.stringify({ players: { filterIds: { value: ids } } }) });
    } catch (e) {
      if (e.status === 401 || e.status === 403) throw e;
      warn(`ESPN didn't return the ${y} draft's player names, so that draft is left off the Drafts tab.`);
      continue;
    }
    for (const p of j.players || []) {
      const st = p.player.stats || [];
      const act = st.find(s => s.statSourceId === 0 && s.statSplitTypeId === 0 && s.scoringPeriodId === 0 && s.seasonId === y);
      const prj = st.find(s => s.statSourceId === 1 && s.statSplitTypeId === 0 && s.scoringPeriodId === 0 && s.seasonId === y);
      H[y].pl[p.id] = [p.player.fullName, p.player.defaultPositionId, act ? r1(act.appliedTotal) : null, prj ? r1(prj.appliedTotal) : null];
    }
  }

  // ---- current season: which weeks are finished, which is next ----
  const C = H[cur];
  let doneWeeks = 0;
  for (let w = 1; w <= C.regWeeks; w++) {
    const g = C.sch.filter(m => m[0] === w && m[6] === 'NONE');
    if (g.length && g.every(m => m[5] && m[5] !== 'UNDECIDED')) doneWeeks = w; else break;
  }
  const previewWeek = doneWeeks < C.regWeeks && C.sch.some(m => m[0] === doneWeeks + 1) ? doneWeeks + 1 : null;

  // ---- current season week by week: lineups, actual and projected points ----
  const wkRaw = {}, pinfo = {};
  const lastWeek = previewWeek || doneWeeks;
  for (let w = 1; w <= lastWeek; w++) {
    const j = await get(cur, ['mMatchupScore', 'mBoxscore'], `&scoringPeriodId=${w}`,
      { 'X-Fantasy-Filter': JSON.stringify({ schedule: { filterMatchupPeriodIds: { value: [w] } } }) });
    const teams = {};
    for (const m of j.schedule || []) {
      if (m.matchupPeriodId !== w) continue;
      for (const side of ['home', 'away']) {
        const s = m[side]; if (!s) continue;
        const ros = (s.rosterForCurrentScoringPeriod || s.rosterForMatchupPeriod || {}).entries || [];
        const e = ros.map(x => {
          const pe = x.playerPoolEntry || {}, pl = pe.player || {};
          const pj = (pl.stats || []).find(st => st.statSourceId === 1 && st.scoringPeriodId === w);
          const ac = (pl.stats || []).find(st => st.statSourceId === 0 && st.scoringPeriodId === w);
          if (!pinfo[x.playerId]) pinfo[x.playerId] = [pl.fullName, pl.defaultPositionId, pl.proTeamId || 0, pl.eligibleSlots || null];
          return [x.playerId, x.lineupSlotId, ac ? r2(ac.appliedTotal) : (pe.appliedStatTotal != null ? r2(pe.appliedStatTotal) : 0), pj ? r2(pj.appliedTotal) : null, pl.injuryStatus || null];
        });
        teams[s.teamId] = { e, total: s.totalPoints };
      }
    }
    wkRaw[w] = teams;
  }

  // ---- this week's NFL games (public scoreboard): which teams are done, playing, or still to come ----
  // ESPN's NFL team ids match the fantasy proTeamId, so the live starters above can be matched to a game.
  let nfl = null;
  try {
    const sb = await getJSON(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${cur}&seasontype=2&week=${lastWeek}&limit=40`);
    nfl = {
      wk: lastWeek, asOf: new Date().toISOString(),
      games: (sb.events || []).map(e => {
        const c = e.competitions[0], st = c.status || {}, side = h => c.competitors.find(x => x.homeAway === h) || {};
        return [+side('home').team.id, +side('away').team.id, (st.type || {}).state || 'pre', e.date, e.shortName,
          +(side('home').score || 0), +(side('away').score || 0), (st.type || {}).shortDetail || ''];
      })
    };
  } catch (e) { /* the site still builds without the live board */ }

  // ---- draft summaries ----
  const draft = {};
  for (const y of seasons) {
    const S = H[y];
    if (!S.picks.length || !Object.keys(S.pl || {}).length) continue;
    const rows = S.picks.map(p => { const pl = S.pl[p[3]] || ['?', 0, 0, 0]; return { rd: p[0], ov: p[1], tm: p[2], name: pl[0], pos: POS[pl[1]] || '?', act: pl[2] || 0, proj: pl[3] || 0 }; });
    const skill = rows.filter(r => !['K', 'D/ST'].includes(r.pos));
    [...skill].sort((a, b) => b.act - a.act).forEach((r, i) => r.prk = i + 1);
    [...skill].sort((a, b) => a.ov - b.ov).forEach((r, i) => r.drk = i + 1);
    skill.forEach(r => r.val = r.drk - r.prk);
    const steals = [...skill].filter(r => r.rd >= 4).sort((a, b) => b.val - a.val).slice(0, 3);
    const busts = [...skill].filter(r => r.rd <= 3).sort((a, b) => a.val - b.val).slice(0, 3);
    const haul = {}; for (const r of rows) haul[r.tm] = (haul[r.tm] || 0) + r.act;
    const f = r => [r.name, r.pos, r.rd, r.ov, r.tm, r1(r.act), r.prk, r.val];
    const firsts = rows.filter(r => r.rd === 1).sort((a, b) => a.ov - b.ov).map(r => [r.name, r.pos, r.ov, r.tm, r1(r.act), r.prk || null]);
    draft[y] = { steals: steals.map(f), busts: busts.map(f), haul: Object.entries(haul).map(([t, v]) => [+t, r1(v)]).sort((a, b) => b[1] - a[1]), firsts };
  }

  // ---- weekly summaries: best possible lineup from the whole roster, using the league's own starting slots ----
  // ESPN lineup slots: 0 QB, 2 RB, 3 RB/WR, 4 WR, 5 WR/TE, 6 TE, 7 OP (superflex), 8-15 defensive players,
  // 16 D/ST, 17 K, 18 P, 19 HC, 20 bench, 21 IR, 23 FLEX (RB/WR/TE).
  const STD_SLOTS = { 0: 1, 2: 2, 4: 2, 6: 1, 23: 1, 16: 1, 17: 1 };
  const BY_POS = { 1: [0, 7], 2: [2, 3, 7, 23], 3: [3, 4, 5, 7, 23], 4: [5, 6, 7, 23], 5: [17], 7: [18], 9: [8, 11, 15], 10: [9, 11, 15],
    11: [10, 15], 12: [12, 14, 15], 13: [13, 14, 15], 14: [19], 16: [16] };  // fallback when ESPN omits a player's eligible slots
  const BREADTH = { 3: 2, 5: 2, 11: 2, 14: 2, 23: 3, 7: 4, 15: 5 };  // how many positions a slot takes (others take one)
  const lineup = Object.entries(C.slots || STD_SLOTS).map(([k, n]) => [+k, +n]).filter(([k, n]) => n > 0 && k !== 20 && k !== 21)
    .sort((a, b) => (BREADTH[a[0]] || 1) - (BREADTH[b[0]] || 1));
  const opt = ents => {
    const pool = ents.filter(e => e[1] !== 21).map(e => {
      const pi = pinfo[e[0]] || [];
      return { el: new Set(pi[3] || BY_POS[pi[1]] || []), pts: e[2] || 0 };
    });
    let t = 0;  // fill one-position slots first, then the flex slots from what's left
    for (const [slot, n] of lineup) {
      for (let i = 0; i < n; i++) {
        const best = pool.filter(p => !p.u && p.el.has(slot)).sort((a, b) => b.pts - a.pts)[0];
        if (best) { best.u = 1; t += best.pts; }
      }
    }
    return t;
  };
  const nm = e => e ? (pinfo[e[0]] || ['?'])[0] : null;
  const wk = {};
  for (const [w, teams] of Object.entries(wkRaw)) {
    wk[w] = {};
    for (const [tid, o] of Object.entries(teams)) {
      const st = o.e.filter(e => e[1] !== 20 && e[1] !== 21), bn = o.e.filter(e => e[1] === 20);
      const projSum = st.reduce((a, e) => a + (e[3] || 0), 0);
      const top = [...st].sort((a, b) => (b[2] || 0) - (a[2] || 0))[0];
      const topB = [...bn].sort((a, b) => (b[2] || 0) - (a[2] || 0))[0];
      const topP = [...st].sort((a, b) => (b[3] || 0) - (a[3] || 0))[0];
      const inj = st.filter(e => e[4] && !['ACTIVE', 'NORMAL'].includes(e[4])).map(e => [nm(e), e[4]]);
      wk[w][tid] = +w <= doneWeeks
        ? { a: r1(o.total), p: r1(projSum), o: r1(opt(o.e)), top: [nm(top), r1(top ? top[2] : 0)], bench: [nm(topB), r1(topB ? topB[2] : 0)] }
        : { p: r1(projSum), topP: [nm(topP), r1(topP ? topP[3] : 0)], inj,
            // in-progress week: live total and each starter as [name, NFL proTeamId, points so far, projected]
            a: r1(st.reduce((a, e) => a + (e[2] || 0), 0)), live: st.map(e => [nm(e), (pinfo[e[0]] || [])[2] || 0, e[2] || 0, e[3]]) };
    }
  }

  // ---- assemble ----
  const tc = s => (s || '').trim().split(/\s+/).map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ');
  // owners are kept as first name + last initial ("Pat K."), so the public data never carries full surnames
  const short = s => { const p = s.split(' ').filter(Boolean); return p.length < 2 ? s : `${p[0]} ${p[p.length - 1][0].toUpperCase()}.`; };
  const mem = {}; for (const y of seasons) for (const m of H[y].members) mem[m.id] = short(tc((m.fn || '') + ' ' + (m.ln || '')));
  const ownIdx = {}, owners = [];
  const oi = id => { if (!(id in ownIdx)) { ownIdx[id] = owners.length; owners.push(mem[id] || 'Unknown'); } return ownIdx[id]; };
  const out = {};
  for (const y of seasons) {
    const S = H[y];
    out[y] = {
      reg: S.regWeeks, po: S.playoffTeams,
      // ...then the ESPN abbreviation and logo URL (added Oct 2026; older snapshots stop at index 11)
      t: S.teams.map(t => [t.id, t.name.replace(/\s+/g, ' '), oi(t.primary), t.rank || 0, t.seed || 0, t.w, t.l, t.tie, r2(t.pf), r2(t.pa), t.moves ? t.moves.acq : 0, t.moves ? t.moves.trades : 0, t.abbrev, t.logo]),
      s: S.sch.map(m => [m[0], m[1], r2(m[2]), m[3], r2(m[4]),
        { HOME: 'H', AWAY: 'A', TIE: 'T', UNDECIDED: 'U' }[m[5]] || m[5],
        { NONE: 'N', WINNERS_BRACKET: 'W', LOSERS_CONSOLATION_LADDER: 'L', WINNERS_CONSOLATION_LADDER: 'C' }[m[6]] || m[6]]),
      done: S.done
    };
  }
  // the starting lineup in words, for the page's "how these numbers work" note
  const SLOT_NAME = { 0: 'QB', 1: 'TQB', 2: 'RB', 3: 'RB/WR', 4: 'WR', 5: 'WR/TE', 6: 'TE', 23: 'FLEX', 7: 'OP', 8: 'DT', 9: 'DE', 10: 'LB',
    11: 'DL', 12: 'CB', 13: 'S', 14: 'DB', 15: 'DP', 16: 'D/ST', 17: 'K', 18: 'P', 19: 'HC' };
  const lineupTxt = [0, 1, 2, 4, 6, 3, 5, 23, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19].filter(k => lineup.some(([s]) => s === k))
    .map(k => { const n = lineup.find(([s]) => s === k)[1]; return (n > 1 ? n + ' ' : '') + SLOT_NAME[k]; }).join(', ');
  return { league: H[cur].name, asOf: opts.today, curWeek: previewWeek || doneWeeks + 1, owners, seasons: out, draft, wk,
    current: cur, doneWeeks, previewWeek, nfl, lineup: lineupTxt };
}
if (typeof module !== 'undefined') module.exports = { buildData };
