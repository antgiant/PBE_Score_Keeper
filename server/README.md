# PBE Score Keeper Sync Server

Combined WebRTC signaling and y-websocket server for PBE Score Keeper real-time sync.

## Architecture

This server handles two types of connections:

1. **WebRTC Signaling** (root path and any path except `/ws/*`)
   - Used for P2P sync in small groups (< 30 users)
   - Backwards compatible with the original y-webrtc signaling
   - Rooms prefixed with `pbe-sync-`

2. **WebSocket Sync** (`/ws/*` paths)
   - Used for large events (30+ users)
   - Server-mediated sync via y-websocket
   - Rooms prefixed with `pbe-ws-`
   - Data is encrypted client-side before transmission

## Local Development

```bash
# Install dependencies
npm install

# Start server
npm start
# Server runs on http://localhost:4444
```

## Deployment to Fly.io

### First-time setup

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Login
fly auth login

# Create app (from server/ directory)
fly launch --no-deploy

# Deploy
fly deploy
```

### Updating existing deployment

```bash
# From server/ directory
fly deploy

# Check status
fly status

# View logs
fly logs
```

## Endpoints

| Path | Purpose |
|------|---------|
| `wss://y-webrtc-pbe.fly.dev/` | WebRTC signaling |
| `wss://y-webrtc-pbe.fly.dev/ws/{room}` | y-websocket sync |
| `https://y-webrtc-pbe.fly.dev/health` | Health check |

## Health Check Response

```json
{
  "status": "ok",
  "signaling": {
    "rooms": 5,
    "connections": 12
  },
  "websocket": {
    "rooms": 2,
    "connections": 45
  }
}
```

## Resource Limits

- Free tier: 256MB RAM, shared CPU
- Connection limit: ~1000 concurrent connections
- Rooms are ephemeral (cleared on server restart)

## Security

- WebSocket sync data is encrypted client-side using AES-256-GCM
- Server only sees encrypted data
- Room passwords never transmitted to server
- Signaling messages are unencrypted but contain no user data

## Monitoring

```bash
# Live logs
fly logs -a y-webrtc-pbe

# Metrics
fly status -a y-webrtc-pbe
```
