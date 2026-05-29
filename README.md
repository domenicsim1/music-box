# MusicBox

A real-time multiplayer music game for remote teams. Players paint colours on a grid to compose music together — no music experience needed.

## How it works

1. One person creates a room and shares the 4-letter code
2. Everyone joins and gets a random instrument: **Bass**, **Lead**, **Melody**, or **Drums**
3. Each round, players paint notes on their canvas (columns = time, rows = pitch/drum sound)
4. When the timer runs out (or everyone clicks **Done**), the bar plays back for the whole group
5. The next round starts with your previous canvas so you can build on it
6. After all bars are done, the full song plays and you can download it as a `.webm` file

## Instruments

| Role | Colour | Sound |
|------|--------|-------|
| Bass | Purple | Low triangle wave |
| Lead | Coral | Bright sawtooth |
| Melody | Teal | Soft sine |
| Drums | Orange | Kick, snare, hi-hats, cymbals |

For drums, each row is a different sound (top = crash, bottom = kick). For melodic instruments, higher rows = higher pitch across one octave of C major.

## Running locally

```bash
# Install dependencies
npm run install:all

# Start dev server (runs both client and server)
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:3001

## Sharing with remote teams

Use [ngrok](https://ngrok.com) to expose the app publicly:

```bash
ngrok http 5173
```

Share the `https://xxxx.ngrok-free.app` URL with your team.

## Stack

- **Client** — Vite + React, Tone.js (audio), Socket.io client
- **Server** — Node.js, Express, Socket.io
- **Audio** — Synthesised entirely in the browser via Tone.js, no samples

## Game settings (host only)

Configured in the lobby before starting:

- **Bars** — number of rounds (default 6)
- **Time per bar** — painting time per round in seconds (default 60)
