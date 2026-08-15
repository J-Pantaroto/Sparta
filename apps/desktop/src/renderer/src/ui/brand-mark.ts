import brandMarkUrl from "../assets/spartan-signal-mark.png";

/**
 * Símbolo oficial "Spartan Signal" do Sparta GG - o mesmo arquivo, byte a
 * byte, que `apps/site/public/img/favicon.png` (favicon + marca do header
 * do site) e `apps/desktop/build/icon.png` (ícone do instalador). Confirmado
 * via `md5sum` nas três localizações antes de copiar (Etapa 31M.1).
 *
 * Precisou ser copiado pra dentro de `src/renderer` porque o bundle do
 * renderer (Vite, `root: "src/renderer"`) não enxerga `apps/desktop/build/`
 * nem `apps/site/public/` - cada pipeline de build (site, instalador,
 * renderer) resolve assets estáticos a partir da própria raiz. Se o mark
 * oficial mudar no futuro, atualizar as três cópias juntas (não existe hoje
 * um pacote compartilhado de assets no monorepo, e criar um só pra um ícone
 * seria desproporcional).
 */
export const BRAND_MARK_URL = brandMarkUrl;
