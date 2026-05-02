# API Surface

## Customer

- `GET /api/customer/feed`: customer-facing feed with `{ slots, generatedAt }`.
- `GET /api/customer/concepts`: assignment-first concept list with `{ concepts }`.
- `GET /api/customer/concepts/[conceptId]`: assignment detail contract for customer concept pages.
- `GET /api/customer/notes`: customer notes with `{ notes }`.
- `GET /api/customer/game-plan`: read-only customer game plan plus brief summary.

## Studio V2

- `GET /api/studio-v2/customers/[customerId]/concepts`: normalized workspace concepts with `{ concepts }`.
- `POST /api/studio-v2/customers/[customerId]/concepts`: creates an assignment, returns `201` with `{ concept }`, rejects duplicates with `409`.
- `PATCH /api/studio-v2/concepts/[conceptId]`: updates a customer concept, returns `{ concept }`.
- `POST /api/studio-v2/feed/mark-produced`: marks one assignment as produced for a specific customer and returns `{ success, concept }`.
- `GET|PUT /api/studio-v2/customers/[customerId]/game-plan`: shared game plan contract `{ game_plan, has_game_plan }`.
- `GET|POST|PATCH|DELETE /api/studio-v2/customers/[customerId]/notes`: notes contract `{ notes }` on reads and `{ note }` on writes.
- `GET|PATCH /api/studio-v2/customers/[customerId]/brief`: brief contract `{ brief }`; PATCH accepts either `{ brief }` or direct partial brief fields.

## Admin

- `GET /api/admin/customers`: canonical list payload is `{ customers }`; legacy `{ profiles }` alias is still returned.
- `POST /api/admin/customers`: returns `201` with `{ customer, profile }`.
- `GET|PATCH /api/admin/customers/[id]`: canonical single-item payload is `{ customer }`; legacy `{ profile }` alias is still returned.

## Remaining Legacy

- Admin routes still expose `profile` and `profiles` aliases for backward compatibility.
- Some older admin and studio pages still read directly from Supabase instead of going through the API surface.
