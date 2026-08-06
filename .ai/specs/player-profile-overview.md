# Perfil analítico do jogador — Etapa 31E

Fonte de verdade: `docs/player-profile-overview.md`.

O contrato `PlayerProfileOverview` agrega somente a conta derivada da sessão, Match-V5,
observações normalizadas e cálculos pessoais versionados em
`player-profile-overview/1.0.0`. `GET /me/player-profile` não aceita identidade arbitrária.

Disponível hoje: Riot ID, plataforma/região, posições observadas, partidas, campeões, métricas
pessoais, objetivos quando persistidos, visão, consistência, dano, farm, sobrevivência, tendência
e loadout. Indisponível hoje: ícone, nível e League-V4 (elo/tier/divisão/LP). Zero, ausência,
parcialidade, amostra pequena e `STALE` são estados distintos.

Os índices do Sparta são consistência, objetivos, visão, impacto em equipe, desempenho recente,
sobrevivência, farm e execução. Cada um publica fórmula, amostra, cobertura e versão; constantes
de posição são parâmetros internos, não comparação populacional.

A fundação visual reutilizável está em `ui/ProfileAnalytics.tsx/.css`, com SVG nativo de escala
fixa 0–100, lacunas sem continuidade falsa, equivalência textual, foco por teclado e redução de
movimento. Não há dependência gráfica nova nem bandeira inferida da região.
