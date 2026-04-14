# Kim's Family Visit — Seattle 2026 🌲

A beautiful itinerary website for the Houston → Seattle trip, April 17–21.

## Opening the site

Double-click `index.html` to open it in your browser.  
**That's it** — the itinerary, maps, and read-only view work immediately, no setup needed.

---

## Enabling multi-device comments & accounts (optional but recommended)

To let family members sign in from their own phones and see each other's comments, set up a free Supabase backend (takes ~5 minutes):

### Step 1 — Create a Supabase project
1. Go to [supabase.com](https://supabase.com) and create a free account
2. Click **New Project** — name it anything (e.g. "kims-trip")
3. Set a database password and wait ~2 minutes for the project to provision

### Step 2 — Set up the database
1. In your Supabase project, click **SQL Editor** in the left sidebar
2. Click **New Query**
3. Paste the entire contents of `supabase-setup.sql` and click **Run**

### Step 3 — Get your API keys
1. Go to **Project Settings → API**
2. Copy the **Project URL** and the **anon/public** key

### Step 4 — Add keys to the config file
Open `js/config.js` and fill in:

```js
const SUPABASE_URL  = 'https://your-project.supabase.co';
const SUPABASE_ANON = 'your-anon-public-key';
const HOST_EMAIL    = 'your-email@example.com'; // Kim's email — gets edit privileges
```

### Step 5 — Share with family
Host the files somewhere accessible (options below), or just open `index.html` locally and share the URL when you're ready.

---

## Hosting options (to share a real URL)

| Option | Cost | Ease | Notes |
|--------|------|------|-------|
| **GitHub Pages** | Free | Easy | Push to a repo, enable Pages |
| **Netlify Drop** | Free | Easiest | Drag the folder to netlify.com/drop |
| **Vercel** | Free | Easy | Connect GitHub repo |

For a private family trip, Netlify Drop is the fastest: go to [netlify.com/drop](https://app.netlify.com/drop), drag the entire `kimsindawa` folder, and you get a live URL instantly.

---

## Features

- **5-day itinerary** — April 17–21, all stops with maps
- **Interactive maps** — Leaflet + OpenStreetMap (no API key needed)
- **Day overview maps** — see all stops pinned for each day
- **Commute info** — travel mode, estimated time, live Google Maps link
- **Guest accounts** — family can sign up and leave comments/suggestions
- **Editable itinerary** — any logged-in user can edit stop details
- **Edit history** — every change is tracked with who made it and when
- **Reservation checklist** — sticky reminder banner at the top
- **Fully responsive** — works great on phones

---

## Editing the itinerary

The full itinerary data lives in `js/data.js` — each day and stop is a JavaScript object. You can edit it directly in a text editor to add, remove, or change any stop before sharing.

The website itself also supports in-browser edits (click the ✏️ pencil icon on any stop when logged in). Those edits are saved to Supabase or localStorage and tracked in the edit history.
