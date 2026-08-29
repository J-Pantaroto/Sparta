import { X509Certificate } from "node:crypto";
import https from "node:https";
import type { TLSSocket } from "node:tls";
import { riotRootCertificate } from "./riot-root-certificate.js";

/** Host e porta fixos da Live Client Data API. Nunca configuraveis pelo renderer. */
export const LIVE_CLIENT_HOST = "127.0.0.1";
export const LIVE_CLIENT_PORT = 2999;

/**
 * Timeout por requisicao. Curto de proposito: o servidor e local, entao
 * qualquer coisa acima disso significa "o Game Client nao esta respondendo",
 * nao "a rede esta lenta". Menor que o intervalo de polling (1000ms) pra
 * uma tentativa nunca sobrepor a proxima.
 */
export const LIVE_CLIENT_TIMEOUT_MS = 800;

export type LiveClientStatus =
  | "OK"
  /** Nada escutando em :2999 - o estado NORMAL fora de partida. */
  | "GAME_NOT_RUNNING"
  | "REQUEST_TIMEOUT"
  /** Respondeu, mas o certificado nao foi assinado pela raiz da Riot. */
  | "UNTRUSTED_CERTIFICATE"
  /** 404 - endpoint existe na API mas nao ha dado agora (ex.: pre-jogo). */
  | "ENDPOINT_UNAVAILABLE"
  | "HTTP_ERROR"
  | "INVALID_RESPONSE";

export type LiveClientResult<T> =
  | { status: "OK"; data: T }
  | { status: Exclude<LiveClientStatus, "OK"> };

/**
 * Verifica, a mao, que o certificado apresentado pelo Game Client foi
 * assinado pela raiz publicada pela Riot.
 *
 * Esta funcao existe porque `https.request({ ca: [...] })` NAO funciona com
 * a raiz da Riot: ela nao tem `basicConstraints: CA:TRUE`, entao o OpenSSL
 * se recusa a usa-la como emissor e a conexao morre com `INVALID_PURPOSE`
 * (medido, com teste de controle isolando que a causa e o `CA:FALSE`, nao
 * o SHA-1 - ver `riot-root-certificate.ts`).
 *
 * Entao a conexao e aberta com `rejectUnauthorized: false` **escopado a
 * este agente** e a verificacao de assinatura e feita aqui. O efeito de
 * seguranca e o mesmo que a Riot pretendia: so aceitamos resposta de um
 * certificado que ela assinou. O que se perde e a checagem de hostname -
 * irrelevante em loopback, ja que o destino e literalmente 127.0.0.1 e o
 * certificado do Game Client nao traz SAN pra esse IP.
 */
export function verifyGameClientCertificate(peerDer: Buffer | undefined): boolean {
  if (!peerDer || peerDer.length === 0) return false;
  try {
    return new X509Certificate(peerDer).verify(riotRootCertificate().publicKey);
  } catch {
    return false;
  }
}

export interface LiveClientRequestOptions {
  /** Aborta a requisicao junto com a sessao/poll que a originou. */
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * GET cru contra a Live Client Data API local.
 *
 * Somente leitura por construcao: o metodo e fixo em GET e nem host, nem
 * porta, nem esquema sao parametros - o chamador so escolhe o `path` dentro
 * de `/liveclientdata/`. Isso e o que impede este cliente de virar um
 * "fetch arbitrario pra localhost" se um dia for exposto por engano.
 */
export function requestLiveClient<T>(
  path: string,
  validate: (payload: unknown) => payload is T,
  options: LiveClientRequestOptions = {}
): Promise<LiveClientResult<T>> {
  return new Promise((resolve) => {
    let settled = false;
    let timedOut = false;
    const finish = (result: LiveClientResult<T>) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    if (options.signal?.aborted) {
      finish({ status: "REQUEST_TIMEOUT" });
      return;
    }

    const request = https.request(
      {
        host: LIVE_CLIENT_HOST,
        port: LIVE_CLIENT_PORT,
        path,
        method: "GET",
        // Escopado A ESTA requisicao. Nunca `NODE_TLS_REJECT_UNAUTHORIZED`,
        // nunca um agente global: o resto do processo (Riot API, Data
        // Dragon, API do Sparta) mantem validacao TLS normal. A verificacao
        // real acontece logo abaixo, contra a raiz da Riot.
        rejectUnauthorized: false,
        headers: { Accept: "application/json" }
      },
      (response) => {
        const socket = response.socket as TLSSocket;
        const peer = socket.getPeerCertificate?.(false);
        if (!verifyGameClientCertificate(peer?.raw)) {
          request.destroy();
          finish({ status: "UNTRUSTED_CERTIFICATE" });
          return;
        }

        let body = "";
        response.setEncoding("utf-8");
        response.on("data", (chunk: string) => {
          body += chunk;
        });
        response.on("end", () => {
          if (response.statusCode === 404) {
            finish({ status: "ENDPOINT_UNAVAILABLE" });
            return;
          }
          if (!response.statusCode || response.statusCode >= 400) {
            finish({ status: "HTTP_ERROR" });
            return;
          }
          if (!body) {
            finish({ status: "INVALID_RESPONSE" });
            return;
          }
          try {
            const payload: unknown = JSON.parse(body);
            finish(
              validate(payload) ? { status: "OK", data: payload } : { status: "INVALID_RESPONSE" }
            );
          } catch {
            finish({ status: "INVALID_RESPONSE" });
          }
        });
      }
    );

    request.setTimeout(options.timeoutMs ?? LIVE_CLIENT_TIMEOUT_MS, () => {
      timedOut = true;
      request.destroy();
      finish({ status: "REQUEST_TIMEOUT" });
    });

    request.on("error", (error: Error & { code?: string }) => {
      if (timedOut) {
        finish({ status: "REQUEST_TIMEOUT" });
        return;
      }
      // ECONNREFUSED aqui NAO e falha: e o estado normal enquanto nao ha
      // partida. Quem consome trata `GAME_NOT_RUNNING` como repouso, nunca
      // como erro a reportar pro usuario.
      finish({
        status:
          error.code === "ECONNREFUSED" || error.code === "EHOSTUNREACH" || error.code === "ENOTFOUND"
            ? "GAME_NOT_RUNNING"
            : "HTTP_ERROR"
      });
    });

    options.signal?.addEventListener(
      "abort",
      () => {
        request.destroy();
        finish({ status: "REQUEST_TIMEOUT" });
      },
      { once: true }
    );

    request.end();
  });
}
