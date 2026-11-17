# Product event taxonomy v1

Roadmap step **S3**. One versioned vocabulary for adoption, so product decisions stop depending on
raw registrations or bot hands.

Status: **v1 implemented** in `app/server/product-events.js`; events are recorded by the server and
read through an admin-only endpoint. Storage is append-only until retention prunes it.

## Events

| Event | When | Allowed properties | Human/bot |
|---|---|---|---|
| `guest_joined` | a guest account is created | `source` | human |
| `account_created` | a registration succeeds | `source` | human |
| `hand_completed` | a completed hand is persisted | `table_id`, `pot`, `rake` | bot only when every hand participant is a bot; mixed participating hands count as human |
| `checkout_started` | a checkout begins | `product_id`, `amount_cents` | human |
| `entitlement_activated` | a purchase unlocks access | `product_id` | human |
| `renewal_completed` | a subscription renews | `product_id` | human |

Declared but not yet emitted by a caller: `checkout_started`, `entitlement_activated`,
`renewal_completed`. They are in the vocabulary so the names do not drift when those flows are
instrumented (S9).

## Rules

- **Only declared names are stored.** Unknown events are dropped, not persisted.
- **Only declared property keys are stored.** Values are numbers, booleans or strings truncated to
  120 characters; free text, cards, credentials and nested objects cannot enter by accident.
- **Recording never throws.** A failed insert is ignored so analytics cannot break gameplay.
- **Every summary splits human and bot** (`is_bot`). `hand_completed` is marked bot only when
  every participant in the hand is a bot; a mixed participating hand counts as human. Occupied seats explicitly marked `inHand: false` are excluded; folded participants remain included. Human activity must
  never be inflated by bot tables.
- **No card content, hole cards, passwords or emails** are recorded. Hand properties are aggregate:
  table id, pot, rake.

## Storage

```sql
CREATE TABLE product_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version INTEGER NOT NULL,
  name TEXT NOT NULL,
  user_id INTEGER,
  is_bot INTEGER NOT NULL DEFAULT 0,
  properties TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX product_events_name_time ON product_events(name, created_at);
```

Retention: 400 days via `prune()`; pruning is exposed but not scheduled yet. It should run with the
daily maintenance job before this table grows without bound.

## Read it

Admin only, restricted to the configured admin network:

```bash
curl -sS "https://dangg.live/api/admin/analytics?days=7" -H "authorization: Bearer <admin token>"
```

Response:

```json
{
  "version": 1,
  "since": "2026-11-10T00:00:00.000Z",
  "days": 7,
  "events": {
    "guest_joined": { "human": 12, "bot": 0, "total": 12 },
    "hand_completed": { "human": 340, "bot": 96, "total": 436 }
  }
}
```

## North-star inputs

The roadmap's north star is *weekly active communities with returning human participants*. v1
supplies the two raw inputs that can be measured immediately — human hands and human joins — while
community/workspace identity arrives with S8. Until then, dashboards must state that communities
are not yet counted rather than substituting registrations.

## Tests

`app/server/product-events.test.js` covers: human/bot split, unknown-event rejection, property
whitelisting and truncation, retention pruning and window boundaries.
