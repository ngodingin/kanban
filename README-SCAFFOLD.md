Scaffold: minimal backend for local testing

Files added:
- `package.json`, `tsconfig.json`
- `src/infrastructure/in_memory_db.ts` (in-memory store + seed)
- `src/modules/card/service.ts` (moveCard implementation)
- `src/server.ts` (Express server exposing move endpoint)

Run locally (requires Node.js and npm):

```bash
npm install
npx ts-node src/server.ts
```

Example move request:

```bash
curl -X POST http://localhost:3000/api/v1/projects/proj_1/cards/card_1/move \
  -H 'Content-Type: application/json' \
  -d '{"destination_list_id":"list_b","expected_version":1,"actor_user_id":"user_1"}'
```
