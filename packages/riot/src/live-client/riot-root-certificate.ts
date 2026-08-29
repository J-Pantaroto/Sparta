import { X509Certificate } from "node:crypto";
import { RIOT_ROOT_CERTIFICATE_PEM } from "./riot-root-certificate-pem.js";

/**
 * Certificado raiz publicado pela Riot para validar o certificado TLS do
 * Game Client local.
 *
 * Origem: https://static.developer.riotgames.com/docs/lol/riotgames.pem
 * (link da propria documentacao de "Live Client Data API" em
 * developer.riotgames.com/docs/lol, que instrui: "use the root certificate
 * to validate the game client's SSL certificate").
 *
 * Baixado e versionado em 2026-08-29. Identidade do arquivo, pra detectar
 * troca silenciosa:
 *   SHA-256 do arquivo : da884275737f024b33c93ae5d28bdb002768a3cb73752ab40254a32218193521
 *   fingerprint256     : CA:8C:9D:32:5B:4C:DC:46:4C:6C:94:A5:85:C8:5E:91:
 *                        EC:23:D4:0B:A5:BF:3A:E2:82:2B:95:1A:4A:50:4E:A3
 *   subject == issuer  : CN=LoL Game Engineering Certificate Authority
 *   validade           : 2013-12-04 ate 2043-11-27
 *
 * ────────────────────────────────────────────────────────────────────────
 * POR QUE ESTE CERTIFICADO NAO PODE SER USADO COMO `ca` DO NODE
 * ────────────────────────────────────────────────────────────────────────
 *
 * A forma obvia - `https.request({ ca: [riotRootCertificate] })` - NAO
 * funciona, e isso foi medido, nao suposto. O certificado publicado e
 * autoassinado mas **nao tem a extensao `basicConstraints: CA:TRUE`**
 * (`X509Certificate.ca === false`). O OpenSSL se recusa a usar um
 * certificado sem esse marcador como emissor de outro, e a conexao morre
 * com `INVALID_PURPOSE` antes de qualquer byte de resposta.
 *
 * Reproduzido com uma cadeia sintetica que replica a estrutura exata da
 * Riot (raiz autoassinada, SHA-1, `CA:FALSE`; folha assinada por ela):
 *
 *   ca pinned + hostname check    -> INVALID_PURPOSE
 *   ca pinned, sem hostname check -> INVALID_PURPOSE
 *   ca pinned + servername        -> INVALID_PURPOSE
 *   rejectUnauthorized: false     -> OK
 *
 * E um teste de CONTROLE isolou a causa: trocando apenas `CA:FALSE` por
 * `CA:TRUE` na raiz - mantendo a assinatura SHA-1 - a validacao **passa**.
 * Ou seja: o bloqueio e a ausencia do `basicConstraints`, nao o SHA-1
 * (o OpenSSL 3.0.13 deste ambiente ainda aceita SHA-1 nesse caminho).
 *
 * ────────────────────────────────────────────────────────────────────────
 * O QUE FAZEMOS NO LUGAR
 * ────────────────────────────────────────────────────────────────────────
 *
 * Em vez de desistir da verificacao (o que `rejectUnauthorized: false`
 * sozinho significaria), a checagem que o OpenSSL se recusa a fazer na
 * construcao da cadeia e feita **a mao**, contra a chave publica desta
 * raiz - ver `verifyGameClientCertificate` em `live-client-client.ts`.
 * Isso preserva a intencao de seguranca da Riot: so aceitamos resposta de
 * um certificado que ela realmente assinou.
 *
 * Verificado nos dois sentidos com a cadeia sintetica: folha legitima
 * ACEITA, folha de outra cadeia REJEITADA.
 */
let cached: X509Certificate | undefined;

/**
 * Raiz da Riot, parseada sob demanda e memoizada. Lanca se a constante
 * estiver corrompida - falhar alto e melhor que degradar em silencio pra
 * uma conexao sem verificacao nenhuma.
 */
export function riotRootCertificate(): X509Certificate {
  cached ??= new X509Certificate(RIOT_ROOT_CERTIFICATE_PEM);
  return cached;
}
