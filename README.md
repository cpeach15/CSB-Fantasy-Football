# Fantasy Football Hall of Fame

A website for your ESPN fantasy football league that keeps itself up to date. It pulls everything from ESPN twice a week and shows:

- **This Week**: last week's results and awards, a write-up of the closest games, next week's preview, power rankings, standings, and a live scoreboard while games are on
- **Trophy Room**: every champion, runner-up and last-place finish
- **Record Book**: highest and lowest scores, biggest blowouts, streaks, luckiest and unluckiest seasons
- **Rivalries**: every owner's record against every other owner
- **Drafts**: each year's steals and busts
- **Owners**: a career page for every owner
- Optional: a **Weekly Bet** tab from a Google Doc of picks, and a **Commissioner's report** each week

It costs nothing: GitHub hosts the site and runs the updates for free. You don't need to write any code. Setup is about 15 minutes of clicking.

---

## Set it up

You need a free GitHub account ([sign up](https://github.com/signup)) and your ESPN league.

### 1. Make your own copy

Click the green **Use this template** button at the top of this page, then **Create a new repository**.

- **Repository name**: anything, like `our-league`. It becomes part of the site's address.
- Choose **Public**. (GitHub only hosts free sites from public repos.)
- Click **Create repository**.

Everything below happens in your new copy.

### 2. Turn on the website

In your copy, open **Settings** (top menu) → **Pages** (left menu). Under **Build and deployment**, set **Source** to **GitHub Actions**. That's it on this screen.

### 3. Let it read your league

**If your league is public on ESPN, skip this step.** (The commissioner can turn on "Make league viewable to public" in the ESPN league settings.)

For a private league, the site needs two "cookies" that prove to ESPN you're in the league. They're easiest to find in Chrome or Edge on a computer:

1. Go to [espn.com/fantasy](https://www.espn.com/fantasy/), sign in, and open your league.
2. Right-click anywhere on the page and choose **Inspect**.
3. In the panel that opens, click the **Application** tab (it may be hidden behind **»**).
4. On the left, open **Cookies** and click the entry ending in `espn.com` (like `https://fantasy.espn.com`).
5. Find the row named **espn_s2** and copy its long value. Then find **SWID** and copy its value, including the `{ }` curly braces.

Now save them in GitHub: in your copy, open **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.

- Name: `ESPN_S2`, Secret: the espn_s2 value. Click **Add secret**.
- Again with Name: `SWID`, Secret: the SWID value.

These work like a login to your ESPN fantasy account, so don't post them anywhere else. GitHub keeps secrets hidden, even from people who can see your repo. They expire about once a year; when they do, the update fails and tells you to copy fresh ones.

### 4. Fill in your league

1. Open the **Actions** tab. If GitHub asks whether to enable workflows, click the green button.
2. On the left, click **Set up my league**, then **Run workflow** on the right.
3. Fill in the boxes:
   - **ESPN league ID**: open your league on ESPN and copy the web address. The ID is the number after `leagueId=`. You can paste the whole address.
   - **League name**: leave it blank to use the name on ESPN.
   - **Colors**: hex codes like `#1F4E8C`. Search "color picker" to find one. Leave blank for blue and gold.
   - **Close games**: what your league calls a game decided by a few points. The defaults are "Nail-Biters" and "Nail-biter".
4. Click the green **Run workflow**.

It saves your settings and starts a second run called **Update the site**, which builds the site. If no **Update the site** run shows up on the Actions tab within a minute, click **Update the site** on the left, then **Run workflow**. After 2–3 minutes, open **Settings** → **Pages** to find your link. It looks like `https://yourname.github.io/our-league/`.

Share the link with the league. Each person can pick their name from the **My team** menu, or you can send a link that does it for them: add `?me=Pat` to the end of the address.

---

## How it stays up to date

The site refreshes itself every **Tuesday morning** (after Monday Night Football) and **Thursday afternoon** (before kickoff). To refresh it any other time, open **Actions** → **Update the site** → **Run workflow**.

To change a setting later, run **Set up my league** again and fill in only what you want to change. Or open `settings.txt` in your copy and click the pencil icon to edit it. That file also has a few extra settings: the close-game margin in points, your time zone, and a first season (to leave out early years if your league changed format).

## Optional extras

### Commissioner's report

Post a weekly write-up at the top of This Week. In your copy, open the `data/reports` folder. Click **Add file** → **Create new file**, name it like `2026-wk08.md` (season and week), and paste the text. Leave a blank line between paragraphs. The first line can be `by: Your Name`, followed by a blank line. Click **Commit changes** and the site rebuilds in a couple of minutes. There's an example in [data/reports/README.md](data/reports/README.md).

### Weekly bet

If your league makes picks each week, keep them in a Google Doc and the site adds a **Weekly Bet** tab with everyone's record.

- Share the doc as **Anyone with the link can view**, and paste its link into the **Set up my league** form.
- Newest week first. Start each week with a line like `Week 8`, then a two-column table (**Insert** → **Table**): name on the left, pick on the right. Use the first names people have on ESPN.
- Put ✅ after a pick that hit, ❌ for a miss, and ➖ for a push.
- When a new season starts, put a line with just the year (like `2025`) above last season's weeks.

The doc's link appears on the site, so anyone who can see the site can open the doc.

### Your own web address

Buy a domain from any registrar, then follow GitHub's guide to [add a custom domain](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site). The site picks up the new address on its next update.

### Slack alerts when an update fails

Create a Slack app with an incoming webhook ([Slack's guide](https://api.slack.com/messaging/webhooks)) and save its URL as a repository secret named `SLACK_WEBHOOK_URL`. To test it, run **Update the site** with "Also send a test message to Slack" ticked.

## What's public

The repo has to be public for free hosting. Anyone who finds it can see the league data it saves: team names, scores, and owners as first name plus last initial (no full names). The site tells search engines not to list it, so in practice people find it through the link you share.

## If something goes wrong

Open **Actions** and click the run with the red ✗. The error near the bottom says what happened.

- **"ESPN says league … is private"**: add the two cookies from step 3, or make the league public on ESPN.
- **"cookies have probably expired"**: copy fresh ones (step 3), then open each secret and click **Update secret**.
- **"Get Pages site failed"** or a GitHub Pages error: turn on Pages (step 2), then run **Update the site** again.
- **"No ESPN league ID yet"**: run **Set up my league** (step 4).
- **The site stopped updating after a quiet stretch**: GitHub pauses scheduled updates in repos with no activity for 60 days. Open **Actions** → **Update the site** and click **Enable workflow**.

## Getting help from Claude

You can paste this into a chat at [claude.ai](https://claude.ai) (the free plan works) and go step by step. Screenshots help.

> I'm setting up a fantasy football Hall of Fame website from a GitHub template. The setup guide is in the README of this repo: [paste your repo's address here]. Walk me through it one step at a time and wait for me to finish each step before moving on. I'm not a programmer.

---

### For the curious

`scripts/fetch.js` pulls the league from ESPN's fantasy API, `scripts/compute.py` works out the stats, `scripts/og.py` draws the link-preview image, and `scripts/build.py` fills in `site/template.html`. The schedule lives in `.github/workflows/update.yml`. Fonts are Graduate and Barlow (SIL Open Font License, in `site/fonts`).
