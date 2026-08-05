# Suporte do Sparta Desktop 0.9.0

O canal público de suporte é o [GitHub Issues](https://github.com/J-Pantaroto/Sparta/issues).
Use o formulário **Relatar problema no Sparta Desktop**. Não há e-mail pessoal de suporte,
telemetria, crash reporting automático nem coleta remota de uso nesta versão.

## O que informar

- Sparta e Windows em uso;
- etapa em que ocorreu (download, instalação, autenticação, recomendação, histórico,
  laboratório ou desinstalação);
- mensagem visível e passos mínimos para reproduzir;
- captura de tela somente depois de ocultar e-mail, Riot ID e outros dados pessoais.

## Diagnóstico e privacidade

O Desktop 0.9.0 **não grava um arquivo de log persistente**. Mensagens do renderer aparecem
somente na sessão de diagnóstico/console; portanto não existe um caminho de log local seguro para
o usuário anexar. Essa é uma limitação conhecida: o diagnóstico atual não basta para investigar
um crash que não possa ser reproduzido.

`%APPDATA%\Sparta` é a pasta de dados do Electron, **não uma pasta de logs**. Ela pode conter
sessão, Local Storage, preferências e cache; nunca anexe a pasta inteira. Não compartilhe:

- senha, token, cabeçalho `Authorization`, `.env` ou chave da Riot;
- dumps completos, banco de dados, Local Storage ou arquivos de outro jogador;
- URL com segredo em query string;
- logs brutos de uma API operada por terceiros.

Quem opera sua própria API pode anexar apenas o trecho sanitizado ao redor do erro. A API registra
eventos estruturados e omite credenciais nos caminhos auditados, mas o operador ainda deve revisar
manualmente o recorte antes de publicá-lo.

## Conectividade

O instalador não inclui a API. O binário 0.9.0 usa por padrão
`http://localhost:3333`; sem uma instância compatível, o login termina após o timeout com
"Não foi possível acessar o serviço pela rede". O modo local permite abrir a interface, mas não
substitui autenticação, recomendações, históricos ou laboratório alimentados pela API.
