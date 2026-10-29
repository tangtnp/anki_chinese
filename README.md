# Hanzi Flow

A mobile-first Chinese flashcard PWA for Vercel, with private Supabase storage and an Anki desktop companion. Includes the 1,980 HSK 1–4 cards from the supplied packages, examples, and audio.

## Run

```sh
npm install
npm run dev
npm run build
python3 -m unittest discover -s tests -v
```

## Activate two-way sync

1. Create a free project at https://supabase.com/dashboard. Run `supabase/setup.sql` in its SQL editor. This enables per-user row-level security. Email/password authentication is used.
2. Open Hanzi Flow → Settings. Enter the Supabase project URL and **public publishable/anon key**. Never use the service-role key. Create an account and confirm the email if required.
3. Import the original `.apkg` files into Anki on Mac. In Anki, Tools → Add-ons → Install from file, choose `public/hanzi-flow.ankiaddon`, and restart.
4. Tools → Hanzi Flow → Connect: enter the same project, public key, email, and password. Only the refresh token is saved (in Anki's local add-on config); the password is not saved. Keep your Mac account secure.
5. The default deck search is `deck:HSK* OR deck:"My Chinese"`. Adjust it to match your imported deck names, or use `*` for all cards. Run the **first Mac sync before studying on the phone**, then sign in/load cloud cards on the phone. HSK package GUIDs match Anki imports automatically.
6. Automatic cloud sync happens every 60 seconds while the phone app is open and online. Anki syncs every 60 seconds while open and outside its reviewer. Sync buttons are available on both.

Phone reviews remain queued while Anki is closed. New phone cards are imported into an Anki “Hanzi Flow” note type. Mac card content, deck names, scheduling, suspensions, and review counts flow back to the phone. Anki calculates final review intervals **at sync time**. Offline phone intervals are estimates, not Anki/FSRS scheduling. Do not review the same card on both devices before syncing: concurrent schedule changes are flagged as conflicts, with the Mac state kept. Conflicts are visible in Progress; after checking Anki history, study the card again if needed. An interrupted review attempt is flagged rather than automatically replayed.

This is a companion sync protocol, not an AnkiWeb client. It does not modify AnkiWeb login/sync. Standard Anki sync continues to work separately.

## Offline and supported cards

Open the site online first. The app shell and visited assets are cached. Reviews and cards persist in browser local storage (separate per account). Audio works offline after that audio file has been played once. Export JSON backups regularly. Browser storage clearing/private browsing removes local-only progress. Cloud and Mac acknowledgements are shown separately.

The HSK fields and Basic/reversed Basic cards have custom display support. Rich text is sanitized. Arbitrary Anki template JavaScript, cloze rendering, custom media outside the bundled HSK audio, card edits from the phone, deletions, and multiple independent Mac profiles sharing an account are not supported. Mac deletions do not delete cloud cards; select a single Anki profile per account. New cloud cards are imported into the chosen deck; expand the deck query for custom deck names. The app sends no AnkiWeb credentials to any service.

The public site contains the supplied HSK study content. Personal cards and review history stay in the user's Supabase account behind RLS. The public Supabase key is expected to be visible to clients; it is not an administrative credential.

## Deploy

Vercel framework: **Vite**, build command `npm run build`, output `dist`. No server secrets are required. Supabase connection settings are entered on each device. Add the Vercel production URL to Supabase Authentication → URL Configuration (Site URL and allowed redirects) for account confirmation. Provider free-tier limits apply. The current project was deployed through the Vercel source-upload API because the connected GitHub account differs from the local GitHub account. Its current build command extracts the uploaded static artifact. Before switching to Git deployments, set the project framework to Vite, build command to `npm run build`, and output to `dist`.

To rebuild assets after replacing packages:

```sh
python3 scripts/import-apkg.py
python3 scripts/package-addon.py
npm run build
```

## Validation

Production TypeScript/build and isolated Python concurrency tests are automated. Live phone → Supabase → Mac verification requires a configured Supabase project and a signed-in Anki companion. Do not consider the sync connection verified until the same test card and its review appear on both devices.

## Automatic review cleanup

Run `supabase/migrations/20261029_review_cleanup.sql` once in the existing project's SQL Editor (or download `/review-cleanup.sql` from the updated site). New projects get the same migration in `supabase/setup.sql`.

Each signed-in web sync removes up to 5,000 applied review records whose **Mac acknowledgement is older than 90 days**. The database records acknowledgement times itself. Existing applied reviews receive a new 90-day grace period when the migration is installed. Pending reviews, conflicts, cards, schedules, and Anki's own review history are preserved. Local review lists reflect cleanup after the next successful sync; daily practice totals stay in the browser's separate history.

Cleanup runs when the website syncs, not while it is closed. Older databases without the migration continue syncing without cleanup. The Mac retry ledger is retained so an old offline device cannot replay a previously applied review after its cloud row expires. Storage usage can still grow with cards and unresolved reviews; cleanup does not guarantee a fixed database size. Postgres may reuse deleted-row space rather than immediately reducing the displayed disk size.
