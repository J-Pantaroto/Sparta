# Etapa 31F — shell, dashboard e sistema visual

O shell autenticado usa sidebar agrupada e recolhível, topbar contextual, estados globais e menu de
conta sem duplicação. O dashboard consome exclusivamente `GET /me/player-profile`, separa zero de
ausência e exibe hero, seis índices pessoais, tendência multivariada, partidas, campeões, ações e
estado operacional. `POST /players/sync` não recebe identidade do renderer.

O sistema visual v2 oferece Espartano, Obsidian e Adaptativo, densidades confortável/compacta e
arte completa/reduzida. Os eixos mudam estrutura visual além de cor; semântica verde/amarelo/vermelho
é fixa e cor de campeão só entra no Adaptativo. Preferências são locais.

Validação: 1.171 testes TypeScript e 1 do analyzer, typecheck/lint/build e Electron empacotado em 1000/1280/1600 px,
incluindo Obsidian compacto/reduzido. Sem dependência nova. Recomendação controlada preservou cinco
principais e uma alternativa; `release-etapa27c-v1` e hashes permaneceram intactos; replay real
`EXACT_REPLAY`, sem divergência ou dependência ausente. Detalhes em
`docs/shell-dashboard-visual-system.md`.
