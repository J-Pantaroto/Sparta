import { extractFile, listPackage, statFile } from "@electron/asar";
import { existsSync } from "node:fs";

const SEGMENTOS_PROIBIDOS = new Set([
  "__fixtures__",
  "fixtures",
  "fixture",
  "__mocks__",
  "mocks",
  "mock",
  "__snapshots__",
  "snapshots"
]);

const CONFIGURACAO_DE_TESTE = /^(?:jest|vitest|playwright|cypress|mocha)\.config\./i;
const EXTENSAO_TEXTO = /\.(?:c?js|mjs|json|html?|css|txt|ya?ml|xml|md)$/i;

const ASSINATURAS_DE_CONTEUDO = [
  ["chave privada", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["token Riot", /RGAPI-[A-Za-z0-9_-]{20,}/],
  ["token GitHub", /(?:gh[oprsu]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/],
  ["chave AWS", /AKIA[0-9A-Z]{16}/],
  ["URL com credencial", /(?:postgres(?:ql)?|redis):\/\/[^\s:'"/]+:[^\s@'"/]+@/i],
  ["payload sintético Riot", /puuid-(?:player|test|mock|fixture)-\d+/i]
];

export function normalizarEntradaAsar(entrada) {
  return entrada.replaceAll("\\", "/").replace(/^\/+/, "");
}

export function motivoDeCaminhoProibido(entrada) {
  const caminho = normalizarEntradaAsar(entrada);
  const segmentos = caminho.toLowerCase().split("/");
  const nome = segmentos.at(-1) ?? "";

  if (segmentos.some((segmento) => SEGMENTOS_PROIBIDOS.has(segmento)))
    return "fixture/mock/snapshot";
  if (/(^|\.)env(?:\.|$)/i.test(nome)) return "arquivo de ambiente";
  if (/\.(?:test|spec)\.[^.]+$/i.test(nome)) return "arquivo de teste";
  if (/\.(?:ts|tsx|mts|cts)$/i.test(nome) && !/\.d\.(?:ts|mts|cts)$/i.test(nome))
    return "fonte TypeScript";
  if (/\.d\.(?:ts|mts|cts)$/i.test(nome)) return "declaração TypeScript";
  if (/\.map$/i.test(nome)) return "source map";
  if (/^tsconfig(?:\..+)?\.json$/i.test(nome)) return "configuração TypeScript";
  if (CONFIGURACAO_DE_TESTE.test(nome)) return "configuração de teste";
  return null;
}

export function achadosDeConteudo(texto) {
  return ASSINATURAS_DE_CONTEUDO.filter(([, regex]) => regex.test(texto)).map(
    ([descricao]) => descricao
  );
}

export function inspecionarAppAsar(caminhoAsar) {
  if (!existsSync(caminhoAsar)) throw new Error(`app.asar ausente: ${caminhoAsar}`);

  const entradas = listPackage(caminhoAsar, { isPack: false });
  const achados = [];

  for (const entradaOriginal of entradas) {
    const caminho = normalizarEntradaAsar(entradaOriginal);
    const motivo = motivoDeCaminhoProibido(caminho);
    if (motivo) achados.push({ caminho, motivo });

    if (!EXTENSAO_TEXTO.test(caminho)) continue;

    let stat;
    try {
      stat = statFile(caminhoAsar, caminho);
    } catch {
      continue;
    }
    if (!("size" in stat) || stat.size > 5 * 1024 * 1024) continue;

    let conteudo;
    try {
      conteudo = extractFile(caminhoAsar, caminho).toString("utf-8");
    } catch {
      continue;
    }
    if (conteudo.includes("\0")) continue;
    for (const descricao of achadosDeConteudo(conteudo)) {
      achados.push({ caminho, motivo: descricao });
    }
  }

  const unicos = [
    ...new Map(achados.map((achado) => [`${achado.caminho}\0${achado.motivo}`, achado])).values()
  ];
  return {
    totalEntradas: entradas.length,
    achados: unicos.sort((a, b) => a.caminho.localeCompare(b.caminho))
  };
}
