# Auditoria de segurança e consistência — 27/10/2026

Escopo: `index.html`, regras do Firestore (final) e do Storage, Cloud Functions, `vercel.json`. Sem acesso aos dados reais; verificação por leitura do código, regras e testes com dados simulados.

## Corrigido agora
| # | Gravidade | Problema | Correção |
|---|---|---|---|
| 1 | **Alta** | **Vínculo forjado.** O pedido de vínculo (`claims/{uid}`) é escrito pelo próprio jogador e o app do admin aprovava sozinho se o pedido dissesse "e-mail verificado" e o e-mail batesse com o de um jogador. Um jogador mal-intencionado podia escrever esses campos à mão, apontar `candidate` para outra pessoa e, com um admin online, herdar o histórico dela. | App: só vincula a pré-cadastro sem login (`p_…`). Regras (arquivo `v2/firestore.rules.endurecida`): e-mail e "verificado" do pedido precisam bater com o token do login; `candidate` precisa começar com `p_`. |

## Pendente de publicar (você)
- Publicar `v2/firestore.rules.endurecida` no lugar da final (mesmas permissões + validações):
  nome/apelido/e-mail com tamanho máximo, `photoURL` só de Storage/Google, `fcmTokens` ≤ 50, `inscrito`/`late` booleanos, validação do pedido de vínculo.
  Testar no Playground e voltar a `firestore.rules.final` se algo falhar.

## Achados que pedem decisão
| # | Gravidade | Achado | Sugestão |
|---|---|---|---|
| 2 | Média | **Financeiro legível por qualquer login.** A tela de estatísticas esconde valores, mas `finance`, `buyinData` e `cashGame` estão no documento da etapa, legível por todo login. | Mover o financeiro para documento só de admin e dar ao jogador só o extrato dele. |
| 3 | Média | **E-mails e tokens de push de todos em `players`**, legíveis por qualquer conta (o cadastro é aberto). Exposição de dados pessoais (LGPD). | Mover `email` e `fcmTokens` para `players/{uid}/privado` (dono + admin) **ou** exigir aprovação de membro antes de ler. |
| 4 | Média | **Cópia antiga em `seasons/2026`** (jogadores com e-mail) continua legível. | Depois de alguns dias de uso estável e backup, limpar `players`/`stages` desse documento (manter `admins`). |
| 5 | Média | **Aceite da política:** já era gravado no cadastro do jogador (versão + data), mas com horário do aparelho, sobrescrevível e sem histórico. | **Feito:** coleção `consents/{uid}__{versão}` com horário do servidor, sem edição nem exclusão (regras em `firestore.rules.endurecida`). Botão "Registrar aceites existentes" no Diagnóstico copia os aceites antigos. |
| 6 | Baixa | `apiKey` do Firebase sem restrição por site. | Restringir a `ppp-poker.vercel.app` no Google Cloud. |
| 7 | Baixa | CSP com `'unsafe-inline'` (app é um arquivo só). Mitigado pela neutralização de texto/links que chegam do Firestore (`sanitizeIncoming`). | Manter a neutralização; avaliar nonces se o app for dividido. |
| 8 | Baixa | `img-src https:` permite imagens externas (rastreio). Mitigado por `photoURL` só de Storage/Google nas regras endurecidas. | — |
| 9 | Baixa | Botão "Voltar ao modelo antigo" aparece a qualquer admin, mas só o dono consegue gravar `config/schema`. | Esconder para os demais admins. |
| 10 | Info | Qualquer conta (inclusive e-mail/senha sem verificar) consegue se cadastrar e ler dados (itens 2 e 3). | Ver itens 2 e 3. |

## Conferido, sem problema
- Admin exige e-mail verificado (Firestore e Storage); conta e-mail/senha não verificada não vira admin.
- Jogador só grava o próprio perfil, a própria inscrição, e só em etapa não encerrada e com inscrições abertas; relógio, etapas, config e `seasons` são só de admin.
- Storage: perfil só do dono; fotos de etapa só admin; sem acesso sem login (conferido na checagem de fotos).
- Texto e links vindos do Firestore são neutralizados antes de virar HTML (nomes, apelidos, e-mails, `photoURL`); telas novas (Redraw, Visão Mesa, Resumo) escapam ou usam dados já neutralizados.
- Separação por temporada: ranking, financeiro, estatísticas, Hall of Fame, pote da Premiação Final, contadores da Início e setas de movimento filtram pela temporada em exibição.
- Redraw só é gravado por admin (grava no documento da etapa).
