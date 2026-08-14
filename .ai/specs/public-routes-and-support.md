# Rotas públicas limpas e Central de Suporte (Etapa 31N)

Duas mudanças no site institucional já publicado em `spartagg.com.br`: as URLs públicas deixaram
de expor `.html`, e passou a existir uma Central de Suporte real em `/suporte`.

**Nada de backend foi criado.** API pública, autenticação web, sessão, banco de usuários e sistema
de tickets continuam deliberadamente ausentes — ver §6.

## 1. Estratégia de URL limpa e por que esta e não outra

Três desenhos foram considerados:

| Abordagem | URL pública | Custo | Problema |
| --- | --- | --- | --- |
| Diretório (`/como-funciona/index.html`) | `/como-funciona/` | reestruturar build e `dist` | o `file_server` do Caddy canonicaliza para **barra final**, que não é a URL pedida; forçar a versão sem barra exige `try_files` + um redirect extra de `/x/` → `/x`, senão as duas servem 200 e viram canônico duplicado |
| Rewrite no cliente (JS/SPA) | `/como-funciona` | router + JS | descartado pelo próprio pedido; quebra sem JS e o site é estático |
| **Arquivo plano + `try_files`** | **`/como-funciona`** | **2 regras no Caddy, zero mudança de build** | depende da config do servidor |

**Escolhida a terceira.** Ela produz exatamente as URLs pedidas (sem barra final), não mexe em
nenhum arquivo do build, e não cria canônico duplicado — porque a versão `.html` responde 301 em
vez de servir conteúdo.

**Trade-off registrado com honestidade:** as URLs limpas dependem do `infra/Caddyfile`. Se o site
um dia for servido por um host que só faz entrega de arquivo (GitHub Pages, S3 puro), seria
preciso migrar para a saída em diretório. O `Caddyfile` e o `Dockerfile.site` vivem neste mesmo
repositório, ao lado do site, então hoje isso não é um risco solto.

## 2. Mudança no Caddy (a menor possível)

Duas adições dentro do bloco `spartagg.com.br`, **nada removido**:

```caddyfile
redir /index.html / 301
@legado {
	path_regexp legado ^/([^/].*)\.html$
	not path /404.html
}
redir @legado /{re.legado.1} 301

root * /srv
try_files {path} {path}.html
file_server
```

Preservados sem alteração: TLS automático, HTTP→HTTPS, `www`→apex, `Strict-Transport-Security`,
`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, a CSP restritiva, `encode`,
`handle_errors` com o 404 do site, o bloco reservado (comentado) da futura API e o endpoint
`/healthz`.

### Por que não há laço

`redir` executa **antes** de `try_files` na ordem de diretivas do Caddy. O pedido a
`/pagina.html` é redirecionado uma vez; o pedido a `/pagina` não casa o matcher e é resolvido por
`try_files`, que faz **reescrita interna** (200) — a reescrita não reentra no redirect. Medido: 1
salto, sempre.

### Guarda de open redirect

O regex é `^/([^/].*)\.html$` e não `^/(.+)\.html$`. Com o segundo, um pedido a
`//exemplo.com/x.html` seria capturado como `exemplo.com/x` e o `Location` sairia
`//exemplo.com/x` — que o navegador lê como URL *protocol-relative*, ou seja, **open redirect**.

Testado contra o Caddy real com três variantes (`//evil.com/x.html`, `///evil.com/x.html`,
`/%2F%2Fevil.com/x.html`): as três colapsam para `Location: /evil.com/x` — caminho de barra única,
na própria origem. Nenhuma produz destino externo.

## 3. Rotas e redirects

| URL pública (canônica) | Arquivo servido | Legado |
| --- | --- | --- |
| `/` | `index.html` | `/index.html` → 301 |
| `/como-funciona` | `como-funciona.html` | `/como-funciona.html` → 301 |
| `/funcionalidades` | `funcionalidades.html` | `/funcionalidades.html` → 301 |
| `/privacidade` | `privacidade.html` | `/privacidade.html` → 301 |
| `/termos` | `termos.html` | `/termos.html` → 301 |
| `/seguranca` | `seguranca.html` | `/seguranca.html` → 301 |
| `/excluir-conta` | `excluir-conta.html` | `/excluir-conta.html` → 301 |
| `/status` | `status.html` | `/status.html` → 301 |
| `/suporte` | `suporte.html` | `/suporte.html` → 301 |

`404.html` fica **fora** do redirect de propósito: é a página de erro servida por `handle_errors`,
não uma rota pública. Continua `noindex` e sem `canonical`.

`canonical`, `og:url`, sitemap e todos os links internos (incluindo nav e rodapé, gerados por
`src/scripts/layout.ts`) apontam para a URL limpa — nenhum link do site provoca um salto de
redirect desnecessário.

## 4. Central de Suporte (`/suporte`)

Página institucional, não um endereço de e-mail solto:

- **Hero** explicando o escopo do canal.
- **Seis categorias** — Problemas técnicos, Conta e acesso, Privacidade e dados, Exclusão de
  conta, Segurança, Outros assuntos — cada uma dizendo *o que enviar* para a resposta ser útil já
  na primeira mensagem. As que têm página dedicada apontam para ela (`/excluir-conta`,
  `/seguranca`, `/privacidade`), porque começar por lá costuma resolver mais rápido.
- **Contato**: `suporte@spartagg.com.br` em destaque + CTA `mailto:` com assunto pré-preenchido
  (`?subject=Suporte%20Sparta%20GG`) — sem nenhum dado pessoal embutido.
- **Expectativa de resposta**: declara explicitamente que **não existe prazo comprometido
  publicamente**. Nenhum SLA foi inventado.
- **Aviso antifraude**: o suporte nunca pede senha, código de verificação ou credencial da Riot.

### O que a página deliberadamente não tem

Sem `<form>`, `<input>`, `<textarea>` ou `<button>` — travado por teste. Um formulário que não
envia para lugar nenhum é pior que nenhum formulário, e não existe backend de tickets nesta etapa.

## 5. Rodapé reestruturado

`Produto` (Como funciona, Funcionalidades, Status) · `Confiança` (Privacidade, Segurança, Termos)
· `Conta` (Excluir conta) · `Suporte` (Central de suporte, `suporte@spartagg.com.br`).

Nenhuma rede social ou comunidade foi inventada. O header **não** ganhou "Suporte": ele tem 4
itens e um CTA, e um quinto item enfraqueceria a hierarquia sem ganho — a Central fica no rodapé,
que é onde se procura suporte.

A grade do rodapé passou a ter marca + 4 colunas só a partir de **1180px**: abaixo disso a coluna
ficaria com ~140px e `suporte@spartagg.com.br` (23 caracteres) transbordaria.

## 6. Ausências deliberadas

**Não implementado nesta etapa, e nenhuma página pública "em breve" foi criada para nada disso:**

`/login`, `/criar-conta`, `/register`, `/conta`, autenticação, sessão, JWT, cookie de
autenticação, banco de usuários, backend de tickets, tabela de tickets, painel do usuário, reset
de senha, verificação de e-mail por web, RSO, vínculo Riot pelo site, upload de anexo e API de
suporte.

Travado por teste: nenhuma página linka para essas rotas e nenhum arquivo `login.html`,
`conta.html` ou `criar-conta.html` existe.

## 7. Arquitetura futura (registro, não implementação)

Possibilidade — **não é compromisso, não tem data e não existe hoje**: a mesma identidade Sparta
poderia um dia atender Desktop, site e suporte por uma conta única, e o histórico de solicitações
apareceria em `/conta` / `/conta/tickets`. Isso exigiria autenticação web, sessão e persistência,
todos fora do escopo atual e todos dependentes dos gates já registrados (API pública desligada,
`BLOCKED_BY_RIOT_APPROVAL`).

Enquanto isso, `suporte@spartagg.com.br` é o canal público real e único.

## 8. Validação executada

**HTTP real contra a config de produção.** O bloco do site foi extraído do `infra/Caddyfile` byte
a byte (só o endereço trocado de domínio para `:8081`, sem TLS) e rodado num container
`caddy:2-alpine` sobre o `dist` construído. `caddy validate` → *Valid configuration*.

| Verificação | Resultado |
| --- | --- |
| 8 rotas `.html` legadas | **301** com `Location` na URL limpa correspondente |
| `/index.html` | **301 → `/`** |
| 9 rotas limpas | **200** |
| Saltos de redirect | **1**, sempre — sem laço |
| `/rota-inexistente` | **404** servindo o 404 do site, com `noindex` |
| Open redirect (3 variantes) | `Location` sempre na própria origem |
| Cabeçalhos de segurança | CSP, HSTS, `X-Frame-Options`, `X-Content-Type-Options` presentes na resposta |

**Layout.** 10 páginas × 5 larguras (360/390/768/1280/1920) = **50/50 sem overflow**, zero imagem
quebrada, zero estilo inline, zero link interno `.html` no DOM, e o e-mail do rodapé sem
transbordar em nenhuma largura. Rodapé com 2 colunas em 768px e marca + 4 colunas em 1280/1920.

**Nota metodológica:** a varredura de layout rodou contra o dev server, não contra o container.
A CSP de produção tem `frame-ancestors 'none'` e `X-Frame-Options: DENY`, então o navegador se
recusa a enquadrar as páginas servidas pelo Caddy — o que é o comportamento correto e foi, na
prática, uma confirmação de que esse hardening está ativo. Markup e CSS são os mesmos nos dois
casos; o que muda é só a URL.

**Testes**: 102 no site (eram 58), sendo 40 novos em `routes-and-support.test.ts`.
