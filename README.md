# QBeat

QBeat is a room-based collaborative music queue built for a serverless deployment model.

Users can:

- create a custom room and share the room code
- join a room by code
- search supported music providers
- add songs into the shared queue
- permanently upvote songs in `up next` and `queued`
- watch the queue reorder in realtime
- keep the room split into 4 explicit states:
  - `currently_playing`
  - `up_next`
  - `queued`
  - `played`

This repo is now structured for:

- `Next.js App Router`
- `Vercel` deployment
- `Supabase` for auth, database, RLS, RPC, and realtime
- serverless route handlers for provider search

## Current Provider Status

Provider support is config-based from a single place:

- config file: [`lib/qbeat/config.ts`](/Users/sunnyc/Desktop/clone/QBeat/lib/qbeat/config.ts)

Current state:

- `YouTube Music`: fully wired for search, queueing, and playback
- `Spotify`: config/data-model/search scaffold exists, but playback is not implemented in this build

Important:

- keep `NEXT_PUBLIC_ENABLE_SPOTIFY=false` unless you also add a Spotify playback integration
- the current player component only renders YouTube playback

## Product Rules Implemented

- no duplicate-song merge logic
- one permanent upvote per user per song
- room expires after inactivity
- queue order for waiting songs is:
  - `vote_count DESC`
  - `added_at ASC`
- only the host should control playback actions

## Architecture

### Frontend

- Home screen: [`app/page.tsx`](/Users/sunnyc/Desktop/clone/QBeat/app/page.tsx)
- Room screen: [`app/room/[id]/page.tsx`](/Users/sunnyc/Desktop/clone/QBeat/app/room/[id]/page.tsx)
- Search panel: [`app/room/[id]/components/Search.tsx`](/Users/sunnyc/Desktop/clone/QBeat/app/room/[id]/components/Search.tsx)
- Player: [`app/room/[id]/components/Player.tsx`](/Users/sunnyc/Desktop/clone/QBeat/app/room/[id]/components/Player.tsx)
- Queue panels: [`app/room/[id]/components/Queue.tsx`](/Users/sunnyc/Desktop/clone/QBeat/app/room/[id]/components/Queue.tsx)

### Shared Client Logic

- app config: [`lib/qbeat/config.ts`](/Users/sunnyc/Desktop/clone/QBeat/lib/qbeat/config.ts)
- Supabase browser client: [`lib/supabase/client.ts`](/Users/sunnyc/Desktop/clone/QBeat/lib/supabase/client.ts)
- anonymous auth bootstrap: [`lib/qbeat/auth.ts`](/Users/sunnyc/Desktop/clone/QBeat/lib/qbeat/auth.ts)
- local nickname persistence: [`lib/qbeat/local-storage.ts`](/Users/sunnyc/Desktop/clone/QBeat/lib/qbeat/local-storage.ts)
- snapshot fetch + optimistic mutations: [`lib/qbeat/room-service.ts`](/Users/sunnyc/Desktop/clone/QBeat/lib/qbeat/room-service.ts)
- queue/state derivation: [`lib/qbeat/room-state.ts`](/Users/sunnyc/Desktop/clone/QBeat/lib/qbeat/room-state.ts)

### Serverless Search Endpoint

- unified provider search route: [`app/api/music/search/route.ts`](/Users/sunnyc/Desktop/clone/QBeat/app/api/music/search/route.ts)

### Database Bootstrap

- Supabase SQL schema + RPCs + RLS: [`supabase/schema.sql`](/Users/sunnyc/Desktop/clone/QBeat/supabase/schema.sql)

## Prerequisites

Before running the app, install or provision:

1. `Node.js 18+`
2. `npm`
3. a `Supabase` project
4. a `YouTube Data API v3` key
5. optionally a `Spotify` app if you want to test provider scaffolding later
6. optionally a `Vercel` project for deployment

## Environment Variables

Create `.env.local` from [`.env.example`](/Users/sunnyc/Desktop/clone/QBeat/.env.example).

Required for the current build:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_ENABLE_YOUTUBE_MUSIC=true
NEXT_PUBLIC_ENABLE_SPOTIFY=false
YOUTUBE_API_KEY=...
```

Only needed if you intentionally enable Spotify scaffolding:

```bash
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
```

## Supabase Setup

### 1. Create a Supabase project

Create a new project in Supabase and copy:

- project URL
- anon public key

### 2. Enable Anonymous Auth

In Supabase:

1. open `Authentication`
2. enable `Anonymous sign-ins`

QBeat uses anonymous users so each participant still gets a stable `auth.uid()` for:

- room membership
- one permanent vote per song
- host ownership checks

### 3. Run the SQL bootstrap

Open the Supabase SQL editor and run the full contents of:

- [`supabase/schema.sql`](/Users/sunnyc/Desktop/clone/QBeat/supabase/schema.sql)

This script creates:

- `rooms`
- `room_members`
- `room_tracks`
- `track_votes`
- `playback_state`
- helper membership/host functions
- queue/playback RPCs
- RLS policies
- realtime publication setup

### 4. Confirm realtime is enabled

The SQL script adds the needed tables to `supabase_realtime`, but you should still confirm in Supabase that realtime is enabled for:

- `rooms`
- `room_members`
- `room_tracks`
- `playback_state`

## Local Development

Install dependencies:

```bash
npm install
```

Start the app:

```bash
npm run dev
```

Open:

```bash
http://localhost:3000
```

## Verification Commands

Lint:

```bash
npm run lint
```

Production build:

```bash
npm run build
```

## Vercel Deployment

This repo is designed to be Vercel-compatible.

Important compatibility decisions already made:

- no custom Node server
- no long-lived app server requirement
- no Socket.IO dependency in runtime
- room sync uses Supabase realtime
- provider search runs as serverless route handlers

### Deploy steps

1. Push the repo to GitHub
2. Import the project into Vercel
3. Add the same environment variables from `.env.local` into Vercel Project Settings
4. Deploy

Recommended production envs in Vercel:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_ENABLE_YOUTUBE_MUSIC=true
NEXT_PUBLIC_ENABLE_SPOTIFY=false
YOUTUBE_API_KEY=...
```

If you later implement Spotify playback:

```bash
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
```

## How the App Works

### Home Flow

- user enters a nickname
- user creates a room or joins an existing room code
- the app ensures an anonymous Supabase session exists

### Room Flow

- joining a room runs the `join_room` RPC
- the client fetches a room snapshot from Supabase
- the client subscribes to realtime changes for:
  - `rooms`
  - `room_tracks`
  - `playback_state`

### Queue Flow

- adding a song calls `add_track_to_room`
- upvoting calls `upvote_track`
- host skip calls `skip_current_track`
- host playback controls call `set_room_playback`

### Queue State Model

- `currently_playing`: exactly one active song or none
- `up_next`: exactly one waiting song or none
- `queued`: remaining waiting songs
- `played`: finished songs

## Single Config Place

All app-level feature toggles and product constants are centralized in:

- [`lib/qbeat/config.ts`](/Users/sunnyc/Desktop/clone/QBeat/lib/qbeat/config.ts)

This is where you change:

- enabled providers
- room expiry hours
- vote mode
- debounce timings
- deployment target metadata

## Known Limitations

- YouTube playback is implemented through the iframe player
- browser autoplay policies can still require user interaction before audio starts
- Spotify provider support is only scaffolded in this revision
- the schema file is provided as a bootstrap script, not as a full migration pipeline
- room expiry is enforced through the room join/activity logic in the current build

## Suggested Next Steps

If you keep building on this version, the highest-value next tasks are:

1. add a generated Supabase TypeScript database type layer
2. move SQL bootstrap into formal migrations
3. add host handoff when the current host disconnects
4. add participant presence counts
5. add E2E tests for multi-tab realtime voting
6. implement provider-specific playback modules before enabling non-YouTube providers in production
