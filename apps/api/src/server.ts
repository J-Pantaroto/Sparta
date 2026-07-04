import { buildApp } from "./app";
import { loadEnv } from "./config/env";

const env = loadEnv();
const app = await buildApp();

try {
  await app.listen({ port: env.API_PORT, host: env.API_HOST });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
