// clock-core.js — lógica PURA do relógio de blinds.
// Sem Firebase, sem DOM, sem Date.now(): tudo depende só dos argumentos,
// por isso dá para testar em Node (clock-core.test.mjs).
//
// Níveis = formato do app: { sb, bb, ante, dur (SEGUNDOS), isBreak }
//
// Estado guardado no Firestore (coleção "clocks"):
//   status      'idle' | 'running' | 'paused'
//   elapsedMs   tempo de torneio acumulado até a última ação (valor congelado)
//   startedAtMs hora do SERVIDOR em que voltou a rodar (null se não está rodando)
//
// Ideia central: ninguém guarda "tempo restante". Cada aparelho calcula
//   elapsed = elapsedMs + (agora - startedAtMs)
// e descobre nível e tempo restante a partir da estrutura de blinds.
// Por isso quem entra tarde vê o valor certo e nenhum aparelho precisa
// estar online para o nível avançar.
//
// BREAK: todo break pré-programado PARA SOZINHO no início e espera o admin
// dar play. Regra (também derivada, sem ninguém gravar nada): uma corrida
// (play → ...) não passa de nenhum break que esteja À FRENTE do ponto onde
// ela começou. Quando o admin dá play parado no início do break, a corrida
// nova começa ali, então o break já não está "à frente" e a contagem segue.

const DEFAULT_DUR_S = 900;

export const IDLE = Object.freeze({ status: 'idle', elapsedMs: 0, startedAtMs: null });

// Aceita qualquer coisa vinda do Firestore e devolve um estado consistente.
export function normalizeState(raw) {
  const r = raw || {};
  const elapsedMs = Number.isFinite(r.elapsedMs) && r.elapsedMs > 0 ? r.elapsedMs : 0;
  const startedAtMs = Number.isFinite(r.startedAtMs) ? r.startedAtMs : null;
  if (r.status === 'running' && startedAtMs !== null) {
    return { status: 'running', elapsedMs, startedAtMs };
  }
  // "running" sem startedAtMs é inconsistente → trata como pausado
  return { status: r.status === 'idle' || !r.status ? 'idle' : 'paused', elapsedMs, startedAtMs: null };
}

// PAUSA ENTRE NÍVEIS: quando o tempo de um nível zera, o relógio segura "00:00" por
// TRANSITION_MS antes de mostrar o nível seguinte (dá tempo de ver o zero e ouvir o bip).
// Essa pausa conta como tempo de torneio (o relógio segue "rodando"), mas não existe depois
// do último nível. O tempo de jogo de cada nível continua sendo exatamente `dur`.
export const TRANSITION_MS = 2000;

function gapOf(opts) {
  return opts && Number.isFinite(opts.gapMs) ? Math.max(0, opts.gapMs) : TRANSITION_MS;
}

export function buildTimeline(levels, gapMs = TRANSITION_MS) {
  let t = 0;
  return levels.map((level, i) => {
    const durMs = (level.dur > 0 ? level.dur : DEFAULT_DUR_S) * 1000;
    const holdMs = i < levels.length - 1 ? gapMs : 0;
    const row = { level, startMs: t, durMs, holdMs, countEndMs: t + durMs, endMs: t + durMs + holdMs };
    t += durMs + holdMs;
    return row;
  });
}

function totalOf(tl) {
  return tl.length ? tl[tl.length - 1].endMs : 0;
}

// Posição real do relógio: { el, blocked }
//   blocked = true quando a corrida em andamento bateu num break e está esperando o admin.
function position(state, now, tl) {
  const total = totalOf(tl);
  if (state.status !== 'running') return { el: Math.min(state.elapsedMs, total), blocked: false };
  // Math.max(0, …): se o relógio local estiver milissegundos atrás do admin,
  // o tempo nunca "volta" para antes do início da ação.
  let el = Math.min(state.elapsedMs + Math.max(0, now - state.startedAtMs), total);
  const gate = tl.find((r) => r.level.isBreak && r.startMs > state.elapsedMs);
  if (gate && el >= gate.startMs) return { el: gate.startMs, blocked: true };
  return { el, blocked: false };
}

function indexAt(tl, elapsedMs) {
  const i = tl.findIndex((row) => elapsedMs < row.endMs);
  return i === -1 ? tl.length - 1 : i;
}

// O que a tela mostra. Chamada por TODOS os aparelhos a cada frame.
export function derive(levels, rawState, now, opts) {
  const state = normalizeState(rawState);
  const tl = buildTimeline(levels, gapOf(opts));
  const totalMs = totalOf(tl);
  const { el, blocked } = position(state, now, tl);
  const finished = totalMs > 0 && el >= totalMs;
  const idx = finished ? tl.length - 1 : indexAt(tl, el);
  const row = tl[idx];
  const running = state.status === 'running' && !blocked && !finished;
  return {
    idx,
    level: row.level,
    next: tl[idx + 1] ? tl[idx + 1].level : null,
    durMs: row.durMs,
    remainingMs: finished ? 0 : Math.max(0, row.countEndMs - el),
    running,
    finished,
    // segurando "00:00" entre dois níveis (a pausa de TRANSITION_MS)
    holding: !finished && el >= row.countEndMs,
    // parado no início de um break, esperando o admin iniciar a contagem
    waiting: !finished && !running && row.level.isBreak && el === row.startMs,
    status: finished ? 'finished' : running ? 'running' : state.status === 'idle' ? 'idle' : 'paused',
  };
}

// Ações do admin. Devolve o novo estado a gravar, ou null se não há o que fazer.
//   { type: 'start' | 'pause' | 'next' | 'prev' | 'reset' }
//   { type: 'setRemaining', remainingMs }   (corrige o tempo do round atual)
export function applyAction(levels, rawState, action, now, opts) {
  const state = normalizeState(rawState);
  const tl = buildTimeline(levels, gapOf(opts));
  const totalMs = totalOf(tl);
  const { el, blocked } = position(state, now, tl);
  const finished = totalMs > 0 && el >= totalMs;
  const idx = finished ? tl.length - 1 : indexAt(tl, el);
  const running = state.status === 'running' && !blocked && !finished;

  // Reposiciona o relógio mantendo rodando/pausado. Regras:
  //  - se o torneio já tinha terminado, ou estava esperando um break, volta pausado;
  //  - se o destino é o INÍCIO de um break, fica pausado esperando o admin.
  const reposition = (newElapsedMs) => {
    const target = Math.min(Math.max(0, newElapsedMs), totalMs);
    const atBreakStart = tl.some((r) => r.level.isBreak && r.startMs === target);
    const status = running && !atBreakStart ? 'running' : state.status === 'idle' ? 'idle' : 'paused';
    return { status, elapsedMs: target, startedAtMs: status === 'running' ? now : null };
  };

  switch (action.type) {
    case 'start':
      if (running || finished) return null;
      return { status: 'running', elapsedMs: el, startedAtMs: now };

    case 'pause':
      if (!running) return null;
      return { status: 'paused', elapsedMs: el, startedAtMs: null };

    case 'next':
      if (idx >= tl.length - 1) return null; // último nível: nada a avançar
      return reposition(tl[idx + 1].startMs);

    case 'prev':
      return reposition(tl[Math.max(0, idx - 1)].startMs);

    case 'setRemaining': {
      const rem = Math.min(Math.max(0, Number(action.remainingMs) || 0), tl[idx].durMs);
      return reposition(tl[idx].countEndMs - rem);
    }

    case 'reset':
      return { status: 'idle', elapsedMs: 0, startedAtMs: null };

    default:
      return null;
  }
}
