// Testes do resumo pós-etapa: janela automática e coerência com o ranking real.
import fs from 'node:fs'; import vm from 'node:vm'; import assert from 'node:assert/strict';
const h = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const cut = (a, b) => h.slice(h.indexOf(a), h.indexOf(b));
const src = [cut('const POINTS_TABLE', '// ── APP STATE'), cut('// ── TIEBREAKER', '// ── FINANCIAL RANKING'), cut('// ── STATS (início)', '// ── STATS (fim)'), cut('// ── RESUMO (início)', '// ── RESUMO (fim)')].join('\n');
const ctx = { DB:{players:[],stages:[]}, ACTIVE_SEASON:'2026', console }; vm.createContext(ctx);
vm.runInContext(src + ';this.f={recapPick,buildRecap,calcRankGeral}', ctx); const f = ctx.f;
const J = o => JSON.parse(JSON.stringify(o));
const P = Array.from({length:10},(_, i)=>({uid:'u'+i, name:'P'+i, nickname:'P'+i}));
const res = (ord,ko) => ord.map((u,i)=>({playerId:u, position:i+1, knockouts: ko&&i<2?2:0}));
const ids = P.map(p=>p.uid);
const S = [
  {id:'1',name:'ETAPA 1',type:'nlholdem',date:'2026-10-10',status:'finished',results:res(ids.slice(0,8))},
  {id:'2',name:'ETAPA 2',type:'knockout',date:'2026-10-21',status:'finished',results:res([...ids.slice(2,10),'u0','u1'].slice(0,9),true)},
  {id:'3',name:'ETAPA 3',type:'nlholdem',date:'2026-11-20',status:'upcoming',results:[]},
];
ctx.DB.players = P; ctx.DB.stages = S;
const at = (y,m,d,hh=10) => new Date(y,m-1,d,hh,0,0);
assert.equal(f.recapPick(S,'2026',at(2026,10,21)), null, 'mesmo dia: não aparece');
assert.equal(f.recapPick(S,'2026',at(2026,10,22)).id, '2', 'dia seguinte: aparece');
assert.equal(f.recapPick(S,'2026',at(2026,10,23)).id, '2', 'dia+2: aparece');
assert.equal(f.recapPick(S,'2026',at(2026,10,24)), null, 'dia+3: some');
assert.equal(f.recapPick(S,'2026',at(2026,10,12)), null, 'etapa 1 antiga não aparece');
// publicação tardia: dentro de 36h
const S2 = J(S); S2[1].publishedAt = at(2026,10,27,9).getTime();
assert.equal(f.recapPick(S2,'2026',at(2026,10,28,9)).id, '2', 'publicada tarde: aparece até 36h');
assert.equal(f.recapPick(S2,'2026',at(2026,10,29,12)), null, 'após 36h some');
const r = f.buildRecap(S, P, '2026', S[1], null);
assert.equal(r.podium.length, 3); assert.equal(r.podium[0].uid, S[1].results[0].playerId);
assert.equal(r.leaders.geral.uid, f.calcRankGeral()[0].p.uid, 'líder geral = ranking do app');
assert.equal(r.participants, S[1].results.length);
assert.ok(r.ko && r.ko.total>0);
assert.ok(!JSON.stringify(r).includes('NaN'));
console.log('recap ok');
