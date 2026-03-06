# Scaling and Disaster Recovery

## Horizontal scaling (Phase 8)

- **API + Socket:** Run multiple instances behind a load balancer. Socket.IO uses the Redis adapter so all instances receive the same game events.
- **Workers:** Run one or more instances of `worker:withdrawal`, `worker:settlement`, and optionally `worker:bet` (when `USE_BET_QUEUE=true`).
- **Game engines:** Prediction and Aviator run in the same process as the API. For very high concurrency, you can run a single dedicated process that only runs the engines (no HTTP routes) and scale API/socket instances separately.

## Distributed game engine (Option 2)

For multiple simultaneous game rounds or 100k+ users:

1. **Redis-backed state:** Use `engine/distributedState.ts` to store aviator round state and active bets in Redis so an engine process can resume or share state.
2. **Coordinator:** A small service or Redis keys can assign which engine instance owns which game/round (e.g. `engine:owner:prediction`, `engine:owner:aviator:{roundId}` with heartbeat).
3. **Separate deployment:** Deploy the engine binary (same codebase, entry that only starts the scheduler and engines) as its own container/pod; API and workers stay separate.

## Database

- **Replica set:** Use a MongoDB replica set and set `MONGODB_USE_TRANSACTIONS=true`. Read-heavy queries use `readPreference: 'secondaryPreferred'` where applicable.
- **Connection pool:** Tune `MONGODB_MAX_POOL_SIZE` (default 50) for your concurrency.

## Backups and failover

- **Backups:** Use MongoDB Atlas automated backups or schedule `mongodump` / filesystem snapshots. Verify restore periodically.
- **Failover:** Document steps to promote a replica and point the app to the new primary (e.g. update `MONGODB_URI`). Restart API and workers after failover.
- **Reconciliation:** After restore or failover, run `npm run reconciliation` to compare internal records with payment provider data.

## Observability

- **Health:** `GET /health` returns Mongo and Redis status; use for load balancer health checks.
- **Metrics:** `GET /metrics` exposes Prometheus metrics (request counts, duration, queue depths). Scrape with Prometheus and visualize with Grafana.
- **Logs:** Set `LOG_JSON=true` for JSON log lines; ship `logs/app.log` to your log aggregator (ELK, CloudWatch, etc.).
