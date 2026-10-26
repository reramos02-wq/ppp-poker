const { onDocumentUpdated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();

const db        = getFirestore();
const messaging = getMessaging();

// ── HELPERS ───────────────────────────────────────────────────────────────────

// Junta todos os fcmTokens (sem repetir) de uma lista de jogadores.
function collectAllTokens(players) {
  const tokens = new Set();
  (players || []).forEach(p => {
    (p.fcmTokens || []).forEach(t => { if (t) tokens.add(t); });
  });
  return Array.from(tokens);
}

// Estrutura de dados em uso: "config/schema" com version 2 = estrutura nova (players/, seasons/2026/stages/).
async function schemaVersion() {
  try {
    const s = await db.doc("config/schema").get();
    return s.exists && s.data().version === 2 ? 2 : 1;
  } catch (e) {
    console.error("schemaVersion error:", e.message);
    return 1;
  }
}

// Tokens de todos os jogadores, conforme a estrutura em uso.
async function loadTokens(version) {
  if (version === 2) {
    const snap = await db.collection("players").get();
    return collectAllTokens(snap.docs.map(d => d.data()));
  }
  const snap = await db.doc("seasons/2026").get();
  return collectAllTokens(snap.exists ? snap.data().players : []);
}

// Envia push em lotes e limpa tokens inválidos.
async function sendPush(tokens, title, body, data = {}, version = 1) {
  if (!tokens.length) return;
  const CHUNK = 500;
  for (let i = 0; i < tokens.length; i += CHUNK) {
    const chunk = tokens.slice(i, i + CHUNK);
    const message = {
      notification: { title, body },
      data: { title, body, ...data },
      tokens: chunk,
    };
    try {
      const res = await messaging.sendEachForMulticast(message);
      const invalid = [];
      res.responses.forEach((r, idx) => {
        if (!r.success) {
          const code = r.error && r.error.code;
          if (
            code === "messaging/registration-token-not-registered" ||
            code === "messaging/invalid-registration-token"
          ) {
            invalid.push(chunk[idx]);
          }
        }
      });
      if (invalid.length) {
        await purgeInvalidTokens(invalid, version);
      }
    } catch (e) {
      console.error("sendEachForMulticast error:", e.message);
    }
  }
}

// Remove tokens inválidos dos jogadores.
async function purgeInvalidTokens(badTokens, version) {
  try {
    if (version === 2) {
      // estrutura nova: um documento por jogador
      for (const t of badTokens) {
        const snap = await db.collection("players").where("fcmTokens", "array-contains", t).get();
        for (const d of snap.docs) {
          await d.ref.update({ fcmTokens: FieldValue.arrayRemove(t) });
        }
      }
      return;
    }
    // estrutura antiga: documento único, em transação
    const ref    = db.doc("seasons/2026");
    const badSet = new Set(badTokens);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const players = snap.data().players || [];
      const updated = players.map(p => ({
        ...p,
        fcmTokens: (p.fcmTokens || []).filter(t => !badSet.has(t)),
      }));
      tx.update(ref, { players: updated });
    });
  } catch (e) {
    console.error("purgeInvalidTokens error:", e.message);
  }
}

async function notifyInscricoesAbertas(stage, tokens, version) {
  const title = "✅ Inscrições abertas!";
  const body  = `As inscrições para ${stage.name} estão abertas. Garanta a sua vaga!`;
  await sendPush(tokens, title, body, { tag: "inscricoes-" + stage.id }, version);
}

// ── GATILHO 1 (estrutura antiga): seasons/2026 atualizado ────────────────────
// Só age enquanto a estrutura antiga estiver em uso (evita avisos duplicados ou falsos
// quando o admin copia dados de volta ao documento antigo, no "voltar ao modelo antigo").
exports.onSeasonUpdated = onDocumentUpdated(
  { document: "seasons/2026", region: "us-central1" },
  async (event) => {
    if ((await schemaVersion()) === 2) return;

    const before = event.data.before.data();
    const after  = event.data.after.data();

    const stagesBefore = before.stages || [];
    const stagesAfter  = after.stages  || [];
    const tokens       = collectAllTokens(after.players || []);
    if (!tokens.length) return;

    const mapBefore = {};
    stagesBefore.forEach(s => { mapBefore[s.id] = s; });

    for (const stageAfter of stagesAfter) {
      const stageBefore = mapBefore[stageAfter.id];
      const wasOpen   = !!stageBefore && stageBefore.allowInscriptions === true;
      const isNowOpen = stageAfter.allowInscriptions === true;
      if (!wasOpen && isNowOpen && stageAfter.status !== "finished") {
        await notifyInscricoesAbertas(stageAfter, tokens, 1);
      }
    }
  }
);

// ── GATILHO 2 (estrutura nova): etapa criada ou alterada ─────────────────────
// Mesma regra de antes: avisa quando allowInscriptions passa a true (abertura/reabertura
// ou etapa nova já criada com inscrições abertas).
exports.onStageWritten = onDocumentWritten(
  { document: "seasons/{season}/stages/{stageId}", region: "us-central1" },
  async (event) => {
    if ((await schemaVersion()) !== 2) return;

    const afterSnap  = event.data.after;
    if (!afterSnap || !afterSnap.exists) return;           // etapa apagada
    const stageAfter = { ...afterSnap.data(), id: event.params.stageId };
    const beforeSnap  = event.data.before;
    const stageBefore = beforeSnap && beforeSnap.exists ? beforeSnap.data() : null;

    const wasOpen   = !!stageBefore && stageBefore.allowInscriptions === true;
    const isNowOpen = stageAfter.allowInscriptions === true;
    if (wasOpen || !isNowOpen || stageAfter.status === "finished") return;

    const tokens = await loadTokens(2);
    if (!tokens.length) return;
    await notifyInscricoesAbertas(stageAfter, tokens, 2);
  }
);
