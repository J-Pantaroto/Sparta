import { BRAND_MARK_URL } from "./brand-mark";
import "./SpartaIdentity.css";

/**
 * Estado visual neutro do produto - usado sempre que não há campeão/skin
 * escolhido (sentinela `key === ""` em `featured-champion-context.tsx`),
 * no lugar do antigo default fixo em Ahri. Ahri é conteúdo do League; isto
 * é a identidade do Sparta GG.
 *
 * Composto só com o que já existe de verdade: o símbolo oficial (mesmo
 * arquivo do favicon do site) em baixíssima opacidade + geometria em CSS
 * puro (linhas de formação diagonais, canto chanfrado) - nenhuma arte nova
 * gerada, nenhum raster inventado. `aria-hidden`: é decoração de fundo, o
 * texto real da tela (título, marca por extenso) já existe em outro lugar.
 */
export function SpartaIdentityBackdrop({ className }: { className?: string }) {
  return (
    <div
      className={`sp-identity${className ? ` ${className}` : ""}`}
      aria-hidden="true"
      style={{ ["--sp-identity-mark" as string]: `url(${BRAND_MARK_URL})` }}
    />
  );
}
