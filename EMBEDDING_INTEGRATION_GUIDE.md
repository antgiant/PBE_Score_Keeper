# Embedding Integration Guide

This guide is for host sites that want to embed PBE Score Keeper as an iframe and control it programmatically.

## 1. Serve The App

The scorekeeper must be served from a web origin. Embedded mode is enabled with:

```text
https://scorekeeper.example/?embedded=1
```

Use HTTPS in production so WebRTC sync and storage APIs work consistently.

## 2. Add The Iframe

Use the smallest sandbox that supports your integration:

```html
<iframe
  id="scorekeeper"
  src="https://scorekeeper.example/?embedded=1"
  sandbox="allow-scripts allow-same-origin allow-downloads"
  style="width: 100%; height: 720px; border: 0;">
</iframe>
```

Do not add broader sandbox permissions unless the host workflow specifically needs them.

## 3. Load The Client

```html
<script src="https://scorekeeper.example/scripts/app-embedding-client.js"></script>
```

```javascript
const pbe = new PBEScoreKeeperAPI(document.getElementById("scorekeeper"), {
  targetOrigin: "https://scorekeeper.example",
  timeoutMs: 10000,
  retries: 1
});

await pbe.ready();
```

Set `targetOrigin` to the exact scorekeeper origin in production.

## 4. Configure Allowed Hosts

For same-origin embedding, no configuration is needed. For cross-origin hosts, configure the scorekeeper frame before or during app startup:

```javascript
EmbeddingAPI.configure({
  allowedOrigins: ["https://host.example"],
  allowedHosts: ["host.example"]
});
```

The first validated origin is locked as the active host origin. Messages from other origins are ignored.

## 5. Control The Scorekeeper

```javascript
await pbe.session.create({ name: "Practice Round" });
await pbe.question.create({ name: "Question 1", maxPoints: 5 });
await pbe.score.set({ teamIndex: 1, score: 4 });
await pbe.score.setExtraCredit({ teamIndex: 1, extraCredit: 1 });

const totals = await pbe.score.getTotalPoints();
console.log(totals.total);
```

All exports use native Yjs update bytes:

```javascript
const exported = await pbe.session.export();
await otherPbe.session.import({ bytes: exported.bytes });
```

## 6. Listen For Events

```javascript
const unsubscribe = pbe.on("question:scored", (score) => {
  console.log("score updated", score);
});

pbe.on("sync:stateChanged", (sync) => {
  console.log("sync state", sync.state);
});

// Later:
unsubscribe();
```

Use `session:stateChanged` when the host needs a broad refresh signal. It is debounced.

## 7. Error Handling

Client methods reject with `PBEScoreKeeperAPIError`.

```javascript
try {
  await pbe.score.set({ teamIndex: 1, score: 99 });
} catch (error) {
  if (error.code === "invalid_parameter") {
    // Show host-side validation feedback.
  }
}
```

Common error codes:

| Code | Meaning |
| --- | --- |
| `ready_timeout` | The iframe did not complete the handshake |
| `timeout` | A command response did not arrive |
| `invalid_parameter` | Payload validation failed |
| `not_found` | Requested session, question, team, or block was not found |
| `payload_too_large` | Message exceeded `maxPayloadBytes` |
| `rate_limited` | Message or command burst exceeded rate limits |

## 8. Cleanup

When the host removes the iframe:

```javascript
pbe.destroy();
```

This removes host message listeners and rejects pending commands.
