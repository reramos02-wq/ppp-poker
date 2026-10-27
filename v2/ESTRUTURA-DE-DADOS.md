# PPP Poker — como os dados estão guardados (estrutura v2)

Projeto Firebase `pppoker-c5f0d`. Chave de estrutura: `config/schema {version: 2}` (ligada em 20/10/2026).

## 1. Visão geral

```
Firestore
├── config/
│   ├── schema ................. {version: 2, at, by}   ← chave do modelo (só o dono grava)
│   └── rules .................. regras padrão exibidas na tela "Regras" (NL Hold'em / PKO)
│
├── players/{uid} .............. UM documento por jogador (estrutura nova)
│     uid, name, nickname, email, photoURL, season, needsSetup,
│     fcmTokens[] (push), deleted/deletedAt (conta excluída → "Ex-jogador"),
│     _ord (posição na lista antiga, usada só para desempates)
│     • uid "p_…"  = pré-cadastro feito por admin, ainda sem login
│     • uid do Firebase Auth = jogador com login
│
├── seasons/
│   └── 2026/ .................. documento-raiz ÚNICO para TODAS as temporadas (2026, 2027…)
│       │   admins[]  ← lista de admins (e-mails/uids)  ← continua só aqui
│       │   (campos antigos players[] / stages[] = cópia congelada do dia da virada; serve ao "Voltar ao modelo antigo")
│       │
│       ├── stages/{stageId} ... UMA etapa por documento
│       │     name, date, time, location, address, type (nlholdem|knockout),
│       │     season ("2027"…; ausente = 2026), isFinal, status (upcoming|finished), allowInscriptions,
│       │     buyin, rebuy, addon, timechip, blindLevels[], ftContribution,
│       │     results[] {playerId, position, points, knockouts}     ← colocações finais
│       │     draft[]   {uid, pos, ko}                              ← rascunho durante a etapa
│       │     publishedAt, photoChampion, photoFinalTable (links do Storage)
│       │     finance {…}  buyinData[] {uid, rs, rd, addon}  cashGame {players, entries, cashouts}   ← FINANCEIRO
│       │     redraw {at, tables, seats, assign[] {uid, t(mesa), p(lugar)}}                            ← sorteio de mesas
│       │
│       ├── regs/{stageId}__{uid} ... UMA inscrição por jogador/etapa
│       │     stageId, uid, inscrito, late, ord (ordem de inscrição), lord (ordem na lista de late)
│       │
│       └── claims/{uid} ........ pedido de vínculo: jogador novo ↔ pré-cadastro "p_…"
│             uid, candidate, via (email|nome), email, emailVerified, name, createdAt
│
└── clocks/ .................... relógio de blinds (tempo sempre derivado, nada de "tick" gravado)
      2026_{stageId} ........... estado do relógio de cada etapa (status, nível, marcos de tempo, stageId, updatedBy)
      2026_blindTemplate ....... modelo padrão de níveis de blinds

Storage (fotos)
├── avatars/{uid} .............. foto de perfil (JPEG < 5 MB; cada um grava a sua)
└── stages/{stageId}/photoChampion.jpg | photoFinalTable.jpg   (só admin grava)

No aparelho do jogador (localStorage — só conveniência)
    ppp_priv_{uid} (aceite da política neste aparelho) · ppp_stats_sel (seleção no gráfico) · ppp_photo_checks_v1 (diagnóstico)
```

## 2. Como as peças se ligam

```
players/{uid} ──┐
                ├─ regs/{stageId}__{uid} ──► stages/{stageId} ──► results[].playerId  ──► RANKING da temporada
claims/{uid} ───┘                              │                    (season da etapa define em qual ano conta)
   (candidate = "p_…")                          ├─ finance / buyinData / cashGame ──► Financeiro, extrato do jogador
                                                ├─ redraw ──► "Visão Mesa" (M1 P5)
                                                └─ photoChampion / photoFinalTable ──► Storage
```

- **Temporada** não é um documento: é o campo `season` de cada etapa. O ranking, as estatísticas, o Hall of Fame e o pote da Premiação Final filtram por ele. Ao virar o ano, nenhuma etapa nova existe → o ranking do ano novo nasce zerado, e os dados do ano anterior ficam intactos.
- **Temporada fechada** = o ano já passou (houve etapa) ou a Mesa Final do ano foi encerrada. Só então aparece o botão "Resumo da Temporada" no Ranking (calculado na hora a partir das etapas, nada é gravado).
- **Jogador** é global (um só documento para todos os anos).
- **Admins** ficam em `seasons/2026.admins`; as regras do Firestore e do Storage leem essa lista.

## 3. Quem lê / quem grava (regras finais publicadas)

| Dado | Ler | Gravar |
|---|---|---|
| `players/{uid}` | qualquer login | o próprio jogador (só o seu) · admin (todos) |
| `seasons/2026` (admins + cópia antiga) | qualquer login | admin (e-mail verificado) |
| `stages/{id}` (resultados, financeiro, redraw, fotos) | qualquer login | admin |
| `regs/{etapa}__{uid}` | qualquer login | o próprio jogador, só a sua e só em etapa aberta · admin |
| `claims/{uid}` | o dono · admin | o dono · apagar: admin |
| `clocks/*` | qualquer login | admin |
| `config/*` | qualquer login | só o dono (e-mail principal verificado) |
| Storage `avatars/{uid}` | qualquer login | o dono |
| Storage `stages/**` | qualquer login | admin |

"Admin" = e-mail principal ou item de `admins`, **sempre com e-mail verificado**.

## 4. Notificações push

`players/{uid}.fcmTokens[]` → Cloud Functions no Google Cloud (`onseasonupdated`, `onstagewritten`) leem os tokens de `players` e enviam o push (inscrições abertas, resultado etc.). Elas escolhem a estrutura lendo `config/schema`.

## 5. Pontos de atenção conhecidos

1. Financeiro (`finance`, `buyinData`, `cashGame`) vive dentro do documento da etapa, que qualquer login consegue ler.
2. `players` guarda e-mail e tokens de push de todos, legíveis por qualquer login.
3. O documento `seasons/2026` ainda tem a cópia antiga de jogadores/etapas (com e-mails).
4. O aceite da política de privacidade fica só no aparelho (`ppp_priv_*`), sem registro no servidor.
Detalhes e correções sugeridas: `v2/AUDITORIA-2026-10-27.md`.
