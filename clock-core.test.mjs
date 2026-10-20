// Rodar:  node clock-core.test.mjs
import assert from 'node:assert/strict';
import { derive, applyAction, normalizeState, IDLE } from './clock-core.js';

const MIN = 60000;
const L = (m, extra = {}) => ({ sb: 100, bb: 200, ante: 0, dur: m * 60, isBreak: false, ...extra });
const BRK = (m) => ({ sb: 0, bb: 0, ante: 0, dur: m * 60, isBreak: true });
// 15 / 15 / break 10 / 15 / 15   → limites em 15, 30, 40, 55, 70 min
const LEVELS = [L(15), L(15), BRK(10), L(15), L(15)];
const T0 = 1_760_000_000_000;

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ok  ' + name); };
// simula o ciclo Firestore: o estado sempre passa por JSON
const persist = (s) => JSON.parse(JSON.stringify(s));
const act = (state, action, now, levels = LEVELS) => {
  const patch = applyAction(levels, state, action, now);
  return patch ? persist(patch) : state;
};
const secs = (v) => Math.ceil(v.remainingMs / 1000);
const view = (state, now, levels = LEVELS) => derive(levels, state, now);

test('parado: mostra o nível 1 com tempo cheio', () => {
  const v = view(IDLE, T0);
  assert.equal(v.idx, 0); assert.equal(secs(v), 900); assert.equal(v.running, false);
});

test('start → conta regressiva correta', () => {
  const s = act(IDLE, { type: 'start' }, T0);
  assert.equal(secs(view(s, T0)), 900);
  assert.equal(secs(view(s, T0 + 5 * MIN)), 600);
  assert.equal(secs(view(s, T0 + 5 * MIN + 500)), 600); // 599,5s restantes → mostra 10:00
  assert.equal(secs(view(s, T0 + 5 * MIN + 1000)), 599);
});

test('pausa congela o tempo, mesmo por horas; play continua de onde parou', () => {
  let s = act(IDLE, { type: 'start' }, T0);
  s = act(s, { type: 'pause' }, T0 + 5 * MIN);
  assert.equal(secs(view(s, T0 + 5 * MIN)), 600);
  assert.equal(secs(view(s, T0 + 5 * MIN + 3 * 60 * MIN)), 600);
  s = act(s, { type: 'start' }, T0 + 3 * 60 * MIN);
  assert.equal(secs(view(s, T0 + 3 * 60 * MIN + MIN)), 540);
});

test('várias pausas somam certo (3min + pausa + 4min = 7min de jogo)', () => {
  let s = act(IDLE, { type: 'start' }, T0);
  s = act(s, { type: 'pause' }, T0 + 3 * MIN);
  s = act(s, { type: 'start' }, T0 + 13 * MIN);
  s = act(s, { type: 'pause' }, T0 + 17 * MIN);
  assert.equal(secs(view(s, T0 + 99 * MIN)), 900 - 7 * 60);
});

test('troca de nível comum acontece sozinha, sem ninguém online (sem drift)', () => {
  const s = act(IDLE, { type: 'start' }, T0);
  const just = view(s, T0 + 15 * MIN - 1);
  assert.equal(just.idx, 0); assert.equal(secs(just), 1);
  const at = view(s, T0 + 15 * MIN);
  assert.equal(at.idx, 1); assert.equal(secs(at), 900); assert.equal(at.running, true);
});

// ───────────────────────── BREAK: para sozinho e espera o admin ─────────────────────────
test('break: ao chegar, o relógio para sozinho e fica esperando (mesmo horas depois)', () => {
  const s = act(IDLE, { type: 'start' }, T0); // nada é gravado depois disso
  for (const t of [30 * MIN, 30 * MIN + 1, 35 * MIN, 40 * MIN, 600 * MIN]) {
    const v = view(s, T0 + t);
    assert.equal(v.idx, 2, 'idx em ' + t / MIN);
    assert.equal(v.level.isBreak, true);
    assert.equal(v.running, false);
    assert.equal(v.waiting, true);
    assert.equal(secs(v), 600, 'break fica com tempo cheio');
    assert.equal(v.status, 'paused');
  }
});

test('break: 1 ms antes de chegar ainda está no nível anterior rodando', () => {
  const s = act(IDLE, { type: 'start' }, T0);
  const v = view(s, T0 + 30 * MIN - 1);
  assert.equal(v.idx, 1); assert.equal(v.running, true); assert.equal(v.waiting, false);
});

test('break: admin dá play parado no break → conta 10 min e depois o jogo segue sozinho', () => {
  let s = act(IDLE, { type: 'start' }, T0);
  s = act(s, { type: 'start' }, T0 + 33 * MIN); // admin libera o break 3 min depois de chegar
  assert.equal(s.elapsedMs, 30 * MIN); // começa do início do break, não de 33
  let v = view(s, T0 + 33 * MIN);
  assert.equal(v.idx, 2); assert.equal(v.running, true); assert.equal(secs(v), 600); assert.equal(v.waiting, false);
  assert.equal(secs(view(s, T0 + 35 * MIN + 12_000)), 600 - 132);
  v = view(s, T0 + 43 * MIN - 1);
  assert.equal(v.idx, 2); assert.equal(secs(v), 1);
  v = view(s, T0 + 43 * MIN); // break acabou → nível 4 já rodando, sem parar de novo
  assert.equal(v.idx, 3); assert.equal(v.running, true); assert.equal(secs(v), 900);
  v = view(s, T0 + 58 * MIN);
  assert.equal(v.idx, 4); assert.equal(v.running, true);
});

test('break: pause/play no meio do break não faz o break esperar de novo', () => {
  let s = act(IDLE, { type: 'start' }, T0);
  s = act(s, { type: 'start' }, T0 + 31 * MIN);
  s = act(s, { type: 'pause' }, T0 + 34 * MIN); // 3 min de break
  s = act(s, { type: 'start' }, T0 + 50 * MIN);
  const v = view(s, T0 + 51 * MIN);
  assert.equal(v.idx, 2); assert.equal(v.running, true); assert.equal(secs(v), 600 - 4 * 60);
});

test('break: pause enquanto espera é no-op; play de novo é no-op depois de liberado', () => {
  const s = act(IDLE, { type: 'start' }, T0);
  assert.equal(applyAction(LEVELS, s, { type: 'pause' }, T0 + 31 * MIN), null);
  const released = act(s, { type: 'start' }, T0 + 31 * MIN);
  assert.equal(applyAction(LEVELS, released, { type: 'start' }, T0 + 32 * MIN), null);
});

test('break: quem abre o app depois vê "aguardando" igual (entrada tardia)', () => {
  const s = act(IDLE, { type: 'start' }, T0);
  assert.deepEqual(view(s, T0 + 45 * MIN), view(persist(s), T0 + 45 * MIN));
  assert.equal(view(s, T0 + 45 * MIN).waiting, true);
});

test('break: "próximo" a partir do nível anterior rodando para no início do break (pausado)', () => {
  let s = act(IDLE, { type: 'start' }, T0);
  s = act(s, { type: 'next' }, T0 + 4 * MIN); // nível 1 → 2, rodando
  assert.equal(view(s, T0 + 4 * MIN).idx, 1);
  assert.equal(view(s, T0 + 4 * MIN).running, true);
  s = act(s, { type: 'next' }, T0 + 5 * MIN); // nível 2 → break: para e espera
  const v = view(s, T0 + 25 * MIN);
  assert.equal(v.idx, 2); assert.equal(v.waiting, true); assert.equal(v.running, false); assert.equal(secs(v), 600);
});

test('break: "anterior" a partir do nível depois do break volta ao break esperando; "próximo" sai dele pausado', () => {
  let s = { status: 'paused', elapsedMs: 41 * MIN, startedAtMs: null }; // nível 4 pausado
  s = act(s, { type: 'prev' }, T0);
  let v = view(s, T0);
  assert.equal(v.idx, 2); assert.equal(v.waiting, true);
  s = act(s, { type: 'next' }, T0);
  v = view(s, T0);
  assert.equal(v.idx, 3); assert.equal(v.running, false); assert.equal(v.waiting, false);
});

test('break: setRemaining dentro do break em andamento mantém rodando', () => {
  let s = act(IDLE, { type: 'start' }, T0);
  s = act(s, { type: 'start' }, T0 + 31 * MIN);
  s = act(s, { type: 'setRemaining', remainingMs: 4 * MIN }, T0 + 32 * MIN);
  const v = view(s, T0 + 32 * MIN);
  assert.equal(v.idx, 2); assert.equal(v.running, true); assert.equal(secs(v), 240);
});

test('dois breaks: cada um espera o admin', () => {
  const LV = [L(10), BRK(5), L(10), L(10), BRK(5), L(10)]; // breaks começam em 10 e 30 min
  let s = persist(applyAction(LV, IDLE, { type: 'start' }, T0));
  assert.equal(derive(LV, s, T0 + 100 * MIN).idx, 1);
  s = persist(applyAction(LV, s, { type: 'start' }, T0 + 12 * MIN)); // libera break 1
  let v = derive(LV, s, T0 + 12 * MIN + 5 * MIN + 10 * MIN + 10 * MIN); // 5 break + 10 + 10 → chegou ao break 2
  assert.equal(v.idx, 4); assert.equal(v.waiting, true); assert.equal(v.running, false);
  s = persist(applyAction(LV, s, { type: 'start' }, T0 + 100 * MIN));
  v = derive(LV, s, T0 + 100 * MIN + 5 * MIN);
  assert.equal(v.idx, 5); assert.equal(v.running, true);
});

// ───────────────────────── resto ─────────────────────────
test('next / prev rodando e pausado (sem break envolvido)', () => {
  let s = act(IDLE, { type: 'start' }, T0);
  s = act(s, { type: 'next' }, T0 + 4 * MIN); // → nível 2, rodando
  let v = view(s, T0 + 4 * MIN);
  assert.equal(v.idx, 1); assert.equal(secs(v), 900); assert.equal(v.running, true);
  s = act(s, { type: 'pause' }, T0 + 6 * MIN);
  s = act(s, { type: 'prev' }, T0 + 7 * MIN); // → nível 1, continua pausado
  v = view(s, T0 + 8 * MIN);
  assert.equal(v.idx, 0); assert.equal(secs(v), 900); assert.equal(v.running, false);
});

test('prev no primeiro nível reinicia o nível; next no último é no-op', () => {
  let s = act(IDLE, { type: 'start' }, T0);
  s = act(s, { type: 'prev' }, T0 + 5 * MIN);
  assert.equal(secs(view(s, T0 + 5 * MIN)), 900);
  const last = { status: 'paused', elapsedMs: 60 * MIN, startedAtMs: null }; // nível 5
  assert.equal(view(last, T0).idx, 4);
  assert.equal(applyAction(LEVELS, last, { type: 'next' }, T0), null);
});

test('setRemaining corrige o tempo do round (rodando e pausado), com limites', () => {
  let s = act(IDLE, { type: 'start' }, T0);
  s = act(s, { type: 'setRemaining', remainingMs: 7 * MIN + 30_000 }, T0 + 2 * MIN);
  assert.equal(secs(view(s, T0 + 2 * MIN)), 450);
  assert.equal(secs(view(s, T0 + 3 * MIN)), 390);
  s = act(s, { type: 'pause' }, T0 + 3 * MIN);
  s = act(s, { type: 'setRemaining', remainingMs: 99 * MIN }, T0 + 4 * MIN); // acima da duração → limita
  assert.equal(secs(view(s, T0 + 4 * MIN)), 900);
  assert.equal(view(s, T0 + 4 * MIN).idx, 0);
});

test('fim do torneio: finished, 00:00, start é no-op, prev volta pausado', () => {
  const s = { status: 'running', elapsedMs: 56 * MIN, startedAtMs: T0 }; // nível 5 rodando
  const v = view(s, T0 + 500 * MIN);
  assert.equal(v.finished, true); assert.equal(v.idx, 4); assert.equal(secs(v), 0); assert.equal(v.running, false);
  assert.equal(applyAction(LEVELS, s, { type: 'start' }, T0 + 500 * MIN), null);
  const back = act(s, { type: 'prev' }, T0 + 500 * MIN);
  const v2 = view(back, T0 + 600 * MIN);
  assert.equal(v2.idx, 3); assert.equal(secs(v2), 900); assert.equal(v2.running, false);
});

test('reset zera tudo', () => {
  let s = act(IDLE, { type: 'start' }, T0);
  s = act(s, { type: 'reset' }, T0 + 20 * MIN);
  const v = view(s, T0 + 30 * MIN);
  assert.equal(v.idx, 0); assert.equal(secs(v), 900); assert.equal(v.running, false);
});

test('ações redundantes são no-op (duplo clique): start rodando, pause pausado', () => {
  const s = act(IDLE, { type: 'start' }, T0);
  assert.equal(applyAction(LEVELS, s, { type: 'start' }, T0 + 1000), null);
  const p = act(s, { type: 'pause' }, T0 + 1000);
  assert.equal(applyAction(LEVELS, p, { type: 'pause' }, T0 + 2000), null);
});

test('relógio do aparelho atrasado em relação ao admin: tempo nunca volta nem fica negativo', () => {
  const s = act(IDLE, { type: 'start' }, T0 + 800); // admin "no futuro" em 800ms
  const v = view(s, T0);
  assert.equal(secs(v), 900); assert.equal(v.idx, 0);
});

test('estado lixo/ausente do Firestore não quebra', () => {
  for (const raw of [null, undefined, {}, { status: 'running' }, { status: 'x', elapsedMs: 'a' }, { status: 'running', startedAtMs: 'z', elapsedMs: -5 }]) {
    const v = view(raw, T0);
    assert.equal(v.idx, 0); assert.equal(secs(v), 900); assert.equal(v.running, false);
  }
  assert.deepEqual(normalizeState({ status: 'running', startedAtMs: T0, elapsedMs: 5 }), { status: 'running', elapsedMs: 5, startedAtMs: T0 });
});

test('nível sem dur usa 15 min (igual ao app)', () => {
  assert.equal(secs(derive([{ sb: 1, bb: 2 }], IDLE, T0)), 900);
});

test('primeiro nível sendo break: start já conta (não há break "à frente")', () => {
  const LV = [BRK(5), L(10)];
  const s = persist(applyAction(LV, IDLE, { type: 'start' }, T0));
  assert.equal(secs(derive(LV, s, T0 + MIN)), 240);
});

// ── Teste de propriedade: sequências aleatórias contra um oráculo independente ──
function fuzz(levels, runs, seed0) {
  let seed = seed0;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const durs = levels.map((l) => l.dur * 1000);
  const isBrk = levels.map((l) => !!l.isBreak);
  const starts = durs.map((_, i) => durs.slice(0, i).reduce((a, b) => a + b, 0));
  const total = durs.reduce((a, b) => a + b, 0);
  const oracle = (elapsed) => {
    for (let i = 0; i < durs.length; i++) if (elapsed < starts[i] + durs[i]) return { idx: i, rem: starts[i] + durs[i] - elapsed };
    return { idx: durs.length - 1, rem: 0 };
  };

  for (let run = 0; run < runs; run++) {
    let now = T0, state = IDLE;
    let mEl = 0, mRunning = false; // modelo: tempo acumulado + rodando
    for (let step = 0; step < 30; step++) {
      const dt = Math.floor(rnd() * 12 * MIN);
      now += dt;
      if (mRunning) { // avança; para em break à frente e no fim
        const gate = starts.findIndex((st, i) => isBrk[i] && st > mEl);
        if (gate !== -1 && mEl + dt >= starts[gate]) { mEl = starts[gate]; mRunning = false; }
        else mEl = Math.min(mEl + dt, total);
        if (mEl >= total) mRunning = false;
      }

      const v = derive(levels, state, now);
      const o = oracle(mEl);
      const where = `run=${run} step=${step}`;
      assert.equal(v.idx, o.idx, 'idx ' + where);
      assert.equal(v.remainingMs, o.rem, 'rem ' + where);
      assert.equal(v.running, mRunning, 'running ' + where);
      const wantWaiting = !mRunning && mEl < total && isBrk[o.idx] && mEl === starts[o.idx];
      assert.equal(v.waiting, wantWaiting, 'waiting ' + where);

      const r = rnd();
      let action;
      if (r < 0.3) action = { type: 'start' };
      else if (r < 0.45) action = { type: 'pause' };
      else if (r < 0.57) action = { type: 'next' };
      else if (r < 0.69) action = { type: 'prev' };
      else if (r < 0.88) action = { type: 'setRemaining', remainingMs: Math.floor(rnd() * 20 * MIN) };
      else action = { type: 'reset' };

      state = act(state, action, now, levels);

      const idx = oracle(mEl).idx;
      const reposition = (target) => {
        mEl = target;
        if (mEl >= total || starts.some((st, i) => isBrk[i] && st === mEl)) mRunning = false;
      };
      if (action.type === 'start') { if (!mRunning && mEl < total) mRunning = true; }
      else if (action.type === 'pause') mRunning = false;
      else if (action.type === 'next') { if (idx < durs.length - 1) reposition(starts[idx + 1]); }
      else if (action.type === 'prev') reposition(starts[Math.max(0, idx - 1)]);
      else if (action.type === 'setRemaining') reposition(starts[idx] + durs[idx] - Math.min(action.remainingMs, durs[idx]));
      else if (action.type === 'reset') { mEl = 0; mRunning = false; }
    }
  }
}

test('fuzz A: 20.000 torneios (1 break) batem com o oráculo', () => fuzz(LEVELS, 20000, 12345));
test('fuzz B: 20.000 torneios (2 breaks, break no início do 2º bloco) batem com o oráculo', () =>
  fuzz([L(10), BRK(5), L(10), L(10), BRK(5), L(10), BRK(3)], 20000, 987654));

console.log(`\n${passed} grupos de teste passaram.`);
