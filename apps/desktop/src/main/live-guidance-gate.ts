/**
 * Gate de produto do protótipo de observação ao vivo.
 *
 * PROTOTYPE_LOCAL_ONLY / NOT_APPROVED_FOR_PUBLIC_LIVE_GUIDANCE.
 *
 * A fundação Live Client Data existe apenas como protótipo local enquanto a
 * Production Application do Sparta GG está em análise pela Riot. Ela NÃO
 * pode ser distribuída publicamente: a própria Riot exige saber quais
 * endpoints locais um produto usa e como, e essa comunicação ainda não foi
 * feita (o texto está preparado, não enviado - ver
 * `docs/live-client-data-foundation.md`).
 *
 * Por que um gate explícito em vez de "é só não mostrar a tela": num build
 * empacotado, esquecer de esconder uma tela é um erro de uma linha. Aqui, o
 * watcher inteiro não chega a iniciar e o canal IPC não é registrado, então
 * o protótipo não tem como vazar pra uma release por descuido de UI.
 *
 * `false` é o default deliberado: só um build de desenvolvimento
 * (`NODE_ENV !== "production"`) COM a variável explicitamente ligada
 * habilita a observação. Um instalador de produção nunca satisfaz as duas
 * condições - e é isso que impede a feature de sair sem decisão consciente.
 */
export const LIVE_GUIDANCE_PUBLIC_RELEASE = false;

export function isLiveClientPrototypeEnabled(
  // Tipo estrutural em vez de `NodeJS.ProcessEnv`: e o que a funcao de fato
  // precisa, e mantem o teste podendo passar um objeto simples.
  env: Record<string, string | undefined> = process.env
): boolean {
  if (LIVE_GUIDANCE_PUBLIC_RELEASE) return true;
  return env.NODE_ENV !== "production" && env.SPARTA_LIVE_CLIENT_PROTOTYPE === "1";
}
