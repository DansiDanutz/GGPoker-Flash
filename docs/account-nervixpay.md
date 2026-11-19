# Per-user NervixPay connections

Any permanent signed-in OpenPoker user may connect one NervixPay merchant account. This connection is optional and is never required for free Play Money, ordinary Play Money top-ups, or joining free games.

## Device approval

The server requests the documented NervixPay device flow with a merchant ID, an explicit `test` or `live` choice, the fixed client name `DanGG / OpenPoker`, and only these scopes:

- `payment_links:write` (NervixPay adds `payment_links:read`)
- `payments:read`
- `integrations:verify`

The browser receives only the user code, `https://nervixpay.live/integrations`, expiry, mode, merchant ID and safe status text. The device code and bearer credential never enter browser state. Polling is limited to NervixPay's five-second interval. Live access requires explicit confirmation in NervixPay; test credentials can create only non-payable drafts.

After exchange, the server stores the one-time bearer token before verification so a temporary verification outage is recoverable. It then verifies the exact merchant, requested mode, required scopes, onboarding state, block state and credential expiry. A mismatch is revoked and discarded. Ordinary credentials expire after seven days and require the user to reconnect.

## Encryption and operations

Set `NERVIXPAY_CONNECTION_KEY` to exactly 32 random bytes encoded as base64. Back it up in the operator's secret manager: losing it makes saved credentials unreadable. Rotate it only with a migration that decrypts every row under the old key and re-encrypts under the new key; changing the environment value alone disconnects users.

AES-256-GCM protects device codes and bearer tokens with per-value random nonces and account-bound authenticated data. Database rows contain ciphertext, tags and non-secret metadata only. Never log request bodies, provider authorization headers or decrypted values, and ensure database backups are encrypted independently.

Disconnect disables the local connection before contacting NervixPay. If remote revocation cannot be confirmed, the row stays locally disabled with encrypted material retained only so a later Disconnect retry can revoke it. A token issued after its attempt was disconnected or replaced goes into a separate encrypted revocation queue; it never overwrites the newer connection and Disconnect retries the queue. If ciphertext cannot be opened, preserve it for recovery with the correct key or manual revocation in NervixPay Agents rather than deleting the only revocation evidence. An explicit disabled row must suppress any legacy environment-configured fallback for that user.

Source contract verified against `DansiDanutz/NervixPay` commit `d3f194f2e882db7e8a2a1c393910bd087fc71eab`: `docs/integrations.md`, `lib/agent-auth-core.ts`, `app/api/agent/device/{request,token,approve}/route.ts`, and `app/api/v1/{verify,credential}/route.ts`.
