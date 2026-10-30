// Used by the container healthcheck (O-05).
fetch(`http://127.0.0.1:${process.env.PORT ?? 1701}/healthz`)
  .then((r) => process.exit(r.ok ? 0 : 1))
  .catch(() => process.exit(1));
