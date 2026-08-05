import { buildApp } from "./app.js";
import { loadEnv } from "./config/env.js";

const env = loadEnv();
const app = await buildApp();

/**
 * Encerramento controlado. Sem isto, o SIGTERM do Docker matava o processo na
 * hora: requisição em curso era cortada no meio, e uma transação aberta
 * (ativação de release, gravação de snapshot+bundle) dependia do timeout do
 * Postgres para ser desfeita. `app.close()` para de aceitar conexões novas e
 * espera as em andamento terminarem.
 */
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    app.log.info({ event: "shutdown_requested", signal });
    const forcedExit = globalThis.setTimeout(() => {
      app.log.error({ event: "shutdown_timeout", signal });
      process.exit(1);
    }, env.SHUTDOWN_GRACE_PERIOD_MS);
    forcedExit.unref();
    void app
      .close()
      .then(() => {
        globalThis.clearTimeout(forcedExit);
        process.exit(0);
      })
      .catch(() => process.exit(1));
  });
}

try {
  await app.listen({ port: env.API_PORT, host: env.API_HOST });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
