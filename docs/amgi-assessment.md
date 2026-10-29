# Amgi assessment for Hanzi Flow

Reviewed 2026-10-29:
- https://github.com/antigluten/amgi
- https://github.com/antigluten/amgi/blob/main/Documentation/ARCHITECTURE.md
- https://github.com/antigluten/amgi/blob/main/Documentation/DATA_FLOWS.md
- https://github.com/antigluten/amgi/blob/main/LICENSE

Amgi is a native SwiftUI iOS/watchOS client. It links the official Anki Rust backend through a C FFI bridge; Rust owns SQLite, scheduling, rendering, and the native Anki sync protocol. It is not a JavaScript library that can be dropped into the Vercel website.

## Applied in this change

These are original web implementations of general design principles, with no Amgi source copied:

- Durable offline storage: migrate collections from localStorage to IndexedDB, with atomic card/review/metadata transactions and account isolation. Existing local JSON is removed only after migration commits.
- Bounded browsing: show 100 matches at a time, with an explicit next batch; search still covers the full collection.
- Separate UI, persistence, collection indexing, and sync modules. Use maps/sets for review reconciliation instead of nested full-collection scans.
- Paginate cloud collections by ID and fetch card content once per sync. Keep the offline collection intact if a later page fails. Display sync progress and storage errors.
- Keep the existing Mac Anki scheduler authoritative. Web offline intervals remain estimates.

## Possible later integration

1. A separate native iPhone app could adopt Amgi's native engine approach, using its supported toolchain and sync-server model.
2. A web client could call a separately hosted Anki backend with durable collection storage. This would be a new backend architecture; Supabase card rows are not a native Anki sync server, and a static Vercel bundle cannot load the iOS Rust framework.
3. Genuine FSRS and arbitrary card-template compatibility require the appropriate engine integration, not merely copying the interface.

Amgi's repository is AGPL-3.0. Direct code adoption needs a licensing and source-distribution plan consistent with that license. This change does not vendor Amgi or change Hanzi Flow's engine.

## Verification limits

Synthetic collection tests cover more than 12,000 cards, a cloud API returning fewer rows than requested, repeated offline reviews, migration, account separation, and transaction failure. Browser QA uses synthetic data on a separate localhost origin and leaves the user's production cards untouched. These checks establish the specific fixes; they do not establish native Anki protocol compatibility or support for every dataset size/device.
