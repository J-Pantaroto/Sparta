/**
 * Erro tipado de chamadas a Riot API, carregando o status HTTP e (quando a
 * Riot manda) o header Retry-After em segundos - usado pelo RiotSyncService
 * para decidir se deve retentar, esperar um tempo especifico, ou desistir.
 */
export class RiotApiError extends Error {
  readonly status: number;
  readonly retryAfterSeconds?: number;

  constructor(message: string, status: number, retryAfterSeconds?: number) {
    super(message);
    this.name = "RiotApiError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
