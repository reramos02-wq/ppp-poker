// Testes das estatísticas: o último ponto do gráfico tem que bater com o ranking geral real do app.
import fs from 'node:fs'; import vm from 'node:vm'; import assert from 'node:assert/strict';
const h = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const cut = (a, b) => h.slice(h.indexOf(a), h.indexOf(b));
const src = [cut('const POINTS_TABLE', '// ── APP STATE'), cut('// ── TIEBREAKER', '// ── FINANCIAL RANKING'), cut('// ── STATS (início)', '// ── STATS (fim)')].join('\n');
const ctx = { DB:{players:[],stages:[]}, ACTIVE_SEASON:'2026', console }; vm.createContext(ctx);
vm.runInContext(src + ';this.f={calcRankGeral,calcRank,statsBuild,statsExtras}', ctx); const f = ctx.f;
// 8 jogadores, resultados pseudo-aleatórios determinísticos (com empates de pontos)
const P = Array.from({length:8},(_, i)=>({uid:'u'+i, name:'P'+i, nickname:'P'+i}));
let seed = 7; const rnd = () => (seed = (seed*1103515245+12345) & 0x7fffffff) / 0x7fffffff;
const mk = (id, type, date, status, isFinal) => {
  const order = P.map(p=>p.uid).sort(()=>rnd()-0.5).slice(0, 6 + Math.floor(rnd()*3));
  return { id, name:'ETAPA '+id, type, date, status, isFinal:!!isFinal, results: status==='finished' ? order.map((u,i)=>({playerId:u, position:i+1, knockouts: type==='knockout'? (i<3?1:0):0})) : [] };
};
ctx.DB.players = P;
ctx.DB.stages = [mk('1','nlholdem','2026-01-10','finished'), mk('2','knockout','2026-02-10','finished'), mk('3','nlholdem','2026-03-10','finished'),
  mk('4','knockout','2026-04-10','finished'), mk('5','nlholdem','2026-05-10','upcoming'), mk('F','nlholdem','2026-12-01','finished', true)];
const D = f.statsBuild(ctx.DB.stages, P, '2026', 'geral');
assert.equal(D.cols.length, 5, 'colunas = etapas não finais (futuras entram, final fora)');
assert.deepEqual(D.cols.map(c=>c.done), [true,true,true,true,false]);
// último ponto == ranking geral real
const real = f.calcRankGeral().map(r=>r.p.uid);
assert.deepEqual(D.last, real, 'ranking do gráfico = ranking do app');
D.series.forEach(e=>{ assert.equal(e.pos[4], null, 'etapa futura em branco'); assert.equal(e.pos[3], real.indexOf(e.uid)+1); });
// por tipo
for (const [t, fn] of [['nlholdem','nlholdem'],['knockout','knockout']]) {
  const Dt = f.statsBuild(ctx.DB.stages, P, '2026', t);
  assert.deepEqual(Dt.last, f.calcRank(fn).map(r=>r.p.uid), 'tipo '+t);
}
// ranking após cada etapa == ranking do app com só as primeiras etapas finalizadas
for (let k=1;k<=4;k++) {
  const keep = ctx.DB.stages.slice(); const saved = keep.map(s=>s.status);
  keep.forEach((s,i)=>{ if(i>=k && s.status==='finished') s.status='upcoming'; });
  const exp = f.calcRankGeral().map(r=>r.p.uid);
  keep.forEach((s,i)=>{ s.status = saved[i]; });
  const got = D.series.filter(e=>e.pos[k-1]!=null).sort((a,b)=>a.pos[k-1]-b.pos[k-1]).map(e=>e.uid);
  assert.deepEqual(got, exp, 'snapshot após etapa '+k);
}
// delta = posição anterior - atual
D.series.forEach(e=>{ let prev=null; e.pos.forEach((p,i)=>{ if(p==null) return; assert.equal(e.delta[i], prev==null?null:prev-p); prev=p; }); });
// extras
const X = f.statsExtras(ctx.DB.stages, P, '2026');
assert.equal(X.total, 4);
const sumFT = X.rows.reduce((s,o)=>s+o.ft,0), sumPlayed = X.rows.reduce((s,o)=>s+o.played,0);
assert.ok(sumFT<=sumPlayed && sumFT>0);
assert.equal(X.rows.reduce((s,o)=>s+o.wins,0), 4, 'uma vitória por etapa');
assert.ok(X.rise.d>0 && X.fall.d<0);
// sem etapas concluídas: não quebra
ctx.DB.stages.forEach(s=>{ if(s.status==='finished') {s.status='upcoming'; s.results=[];} });
const E = f.statsBuild(ctx.DB.stages, P, '2026', 'geral'); assert.equal(E.doneCount,0); assert.equal(E.series.length,0);

// nenhum dado financeiro na página de estatísticas (nem prêmio, nem gasto)
const block = h.slice(h.indexOf('// ── STATS (início)'), h.indexOf('function renderRanking()'));
for (const bad of ['fmtBRL','R$','premia','Premia','buyin','.finance','getFTContribution','calcPot','calcArrec','entradaJogador','saldo']) assert.ok(!block.includes(bad), 'financeiro vazou: '+bad);
console.log('STATS OK');
// eficiência: soma de pontos por jogador / etapas jogadas
{
  ctx.DB.stages = [{id:'a',name:'A',type:'nlholdem',date:'2026-01-01',status:'finished',results:[{playerId:'u0',position:1},{playerId:'u1',position:2}]},
                   {id:'b',name:'B',type:'nlholdem',date:'2026-02-01',status:'finished',results:[{playerId:'u1',position:1},{playerId:'u2',position:12}]}];
  const X2 = f.statsExtras(ctx.DB.stages, P, '2026'); const m = Object.fromEntries(X2.rows.map(o=>[o.uid,o]));
  assert.equal(m.u0.pts, 25); assert.equal(m.u1.pts, 25+18); assert.equal(m.u1.played, 2); assert.equal(m.u2.pts, 2);
  assert.equal(m.u1.pts/m.u1.played, 21.5);
}
console.log('EFICIENCIA OK');
