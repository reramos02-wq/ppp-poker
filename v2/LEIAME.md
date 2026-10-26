# Estrutura nova de dados (v2)

Jogadores em `players/{uid}`, etapas em `seasons/2026/stages/{id}`, inscrições em `seasons/2026/regs/{etapa}__{uid}`, pedidos de vínculo em `seasons/2026/claims/{uid}`. A chave é `config/schema` (`version: 2`); sem ela o app usa o documento único de sempre.

## Ordem
1. Publicar `firestore.rules.transicao` (Firestore → Regras). O app atual continua igual.
2. Admin → Ferramentas → Diagnóstico → **1. Copiar e conferir**. Só segue se aparecer "Tudo igual".
3. **2. Virar para a estrutura nova**. Quem estiver com o app aberto recarrega sozinho.
4. Usar alguns dias. Depois publicar `firestore.rules.final`.
5. Voltar atrás: mesmo painel → **Voltar ao modelo antigo** (copia o estado atual de volta para o documento antigo e desliga a chave).

O documento antigo nunca é apagado.
