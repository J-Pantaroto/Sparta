import { createHash } from "node:crypto";

/**
 * Redação de identificadores no log de acesso (Etapa 28b).
 *
 * A auditoria da 28a registrou que o PUUID aparecia no log toda vez que uma
 * rota `/players/:puuid/...` era chamada — o Fastify loga `req.url`, e o
 * PUUID está no caminho. É um identificador estável e vitalício de um
 * jogador na Riot; mantê-lo em texto no log é retenção de dado pessoal sem
 * necessidade operacional.
 *
 * A troca não é por remoção cega: correlacionar requisições do mesmo jogador
 * continua sendo útil para diagnóstico. O identificador vira um **hash não
 * reversível e truncado**, estável dentro do mesmo processo e sem valor fora
 * dele.
 */

/**
 * Prefixo do rótulo no log. Deixa explícito que o valor é derivado, não o
 * identificador original — alguém lendo o log não deve confundir os dois.
 */
const OPAQUE_PREFIX = "pid_";

/**
 * SHA-256 truncado em 12 hex (48 bits). Não é reversível e não pretende ser
 * resistente a força bruta sobre um espaço pequeno — o objetivo é tirar o
 * identificador do log preservando correlação, não criar um segredo.
 *
 * O sal de processo faz o mesmo PUUID render rótulos diferentes entre
 * execuções: correlacionar dentro de um processo continua possível, juntar
 * logs de execuções distintas para reconstruir histórico, não.
 */
const PROCESS_SALT = createHash("sha256")
  .update(String(process.pid))
  .update(String(Date.now()))
  .digest("hex");

export function opaqueIdentifier(value: string): string {
  return (
    OPAQUE_PREFIX +
    createHash("sha256").update(PROCESS_SALT).update(value).digest("hex").slice(0, 12)
  );
}

/**
 * Segmentos de caminho que carregam identificador de jogador. Lista explícita
 * em vez de heurística por formato: adivinhar "o que parece um PUUID" acerta
 * hoje e erra quando a Riot mudar o formato, e erra para os dois lados
 * (deixa passar, ou destrói um segmento legítimo).
 */
const SEGMENTS_WITH_PLAYER_ID = new Set(["players", "postgame"]);

/**
 * Substitui identificadores de jogador no caminho por um rótulo opaco.
 *
 * `/players/<puuid>/recent-matches` → `/players/pid_ab12cd34ef56/recent-matches`
 *
 * A query string é preservada: hoje ela só carrega `limit`/`offset`. Se algum
 * dia carregar identificador, esta função é o ponto único a mudar.
 */
export function redactRequestUrl(url: string): string {
  const [path, query] = url.split("?", 2);
  const segments = path.split("/");
  for (let index = 0; index < segments.length - 1; index += 1) {
    if (SEGMENTS_WITH_PLAYER_ID.has(segments[index]) && segments[index + 1]) {
      segments[index + 1] = opaqueIdentifier(segments[index + 1]);
    }
  }
  const redacted = segments.join("/");
  return query === undefined ? redacted : `${redacted}?${query}`;
}

/**
 * Serializador de requisição para o logger.
 *
 * Emite só o que serve para diagnóstico. **Não** emite `headers`: é ali que
 * viajam `authorization` e `cookie`, e a forma segura de não vazá-los é não
 * os coletar — mais confiável que uma lista de redação que precisa acompanhar
 * cada header novo.
 */
export function requestLogSerializer(request: {
  method: string;
  url: string;
  ip?: string;
  id?: string;
}): Record<string, unknown> {
  return {
    id: request.id,
    method: request.method,
    url: redactRequestUrl(request.url),
    remoteAddress: request.ip
  };
}
