// Testes do financeiro: extrai as funções reais do index.html e executa.
import fs from 'node:fs'; import vm from 'node:vm'; import assert from 'node:assert/strict';
const h = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const cut = (a, b) => h.slice(h.indexOf(a), h.indexOf(b));
const src = [
  cut('// Número no formato brasileiro', '// Default blind structure'),
  cut('function calcAvgStack', '// ── LOGO (vetorial)'),
].join('\n');
const ctx = { DB: { players: [] }, ACTIVE_SEASON: '2026', console }; vm.createContext(ctx);
vm.runInContext(src + `;this.f={parsePtNum,parseBRL,parseChips,getBuyinValues,calcArrecadado,calcPotFinal,calcTaxaFT,calcPotLiquido,calcPremiacao,calcKOFromEntries,calcKOEarnings,calcStaffPayouts,entradaJogador,getCashPlayerSaldo,getITMPercents,ITM_TABLE_NLH,ITM_TABLE_PKO}`, ctx);
const f = ctx.f;
// parser pt-BR
assert.equal(f.parseBRL('R$ 100 (20k fichas)'), 100);
assert.equal(f.parseBRL('R$ 1.500'), 1500);
assert.equal(f.parseBRL('R$ 1.500,50'), 1500.5);
assert.equal(f.parseBRL('R$ 12,5'), 12.5);
assert.equal(f.parseBRL(''), 0); assert.equal(f.parseBRL('sem valor'), 0);
assert.equal(f.parseChips('R$ 150 (20k fichas)'), 20000);
assert.equal(f.parseChips('R$ 150 (1,5k fichas)'), 1500);
assert.equal(f.parseChips('20.000 fichas'), 20000);
assert.equal(f.parseChips('20000 fichas'), 20000);
// ITM soma 100%
for (const t of [...f.ITM_TABLE_NLH, ...f.ITM_TABLE_PKO]) assert.equal(t.pcts.reduce((a,b)=>a+b,0), 100);
// torneio NLH: 10 jogadores, buy-in 100, 2 rebuys RS 100, 1 RD 180, 1 addon 50; custos 550+350
const stage = { id:'s', type:'nlh', buyin:'R$ 100 (20k fichas)', rebuy:'R$ 100 (20k) / R$ 180 (40k)', addon:'R$ 50 (20k)',
  inscriptions:Array.from({length:10},(_, i)=>'u'+i),
  buyinData:[{uid:'u0',rs:2,rd:1,addon:true},{uid:'u1'}], finance:{floorCost:550,dealers:[{cost:350}],extraCosts:[],caixinhaCash:0,caixinhaTorneio:0} };
const arrec = 10*100 + 2*100 + 180 + 50; assert.equal(f.calcArrecadado(stage), arrec);   // registro faltando campos não gera NaN
assert.equal(f.calcPotFinal(stage), arrec-900);
const pot = arrec-900, ft = pot*0.15; assert.ok(Math.abs(f.calcTaxaFT(stage)-ft)<1e-9);
const liq = pot-ft; assert.ok(Math.abs(f.calcPotLiquido(stage)-liq)<1e-9);
const pr = f.calcPremiacao(stage); assert.equal(pr.length, 2);   // 10 jogadores → 2 premiados (65/35)
assert.ok(Math.abs(pr.reduce((s,p)=>s+p.value,0)-liq) < 0.02, 'prêmios somam o pot líquido (±1 centavo)');
// pot negativo nunca gera prêmio nem taxa negativos
const poor = { ...stage, inscriptions:['u0'], buyinData:[], finance:{floorCost:5000,dealers:[],extraCosts:[]} };
assert.ok(f.calcTaxaFT(poor) === 0); assert.ok(f.calcPremiacao(poor).every(p=>p.value>=0));
// override manual com value null/"" cai no percentual; value numérico vale
const ov = { ...stage, finance:{...stage.finance, prizeOverrides:[{value:null,pct:70},{value:100}]} };
const po = f.calcPremiacao(ov); assert.ok(po[0].value>0); assert.equal(po[1].value,100);
// PKO: KO pool tirado da base; staff reparte caixinha
const pko = { ...stage, type:'knockout', finance:{...stage.finance, caixinhaCash:90}, results:[{playerId:'u0',position:1,knockouts:3}] };
assert.equal(f.calcKOFromEntries(pko), (10+2+1)*4*25);
assert.equal(f.calcKOEarnings(pko,'u0'), 75);
const staff = f.calcStaffPayouts(pko); assert.equal(staff.length, 2); assert.equal(staff[0].share, 45); assert.equal(staff[1].total, 350+45);
// cash
ctx.DB.players=[]; const cs = { id:'c', cashGame:{players:['a'], entries:{a:[{value:100},{value:50}]}, cashouts:{a:null}} };
assert.equal(f.getCashPlayerSaldo(cs,'a'), null); cs.cashGame.cashouts.a = 400; assert.equal(f.getCashPlayerSaldo(cs,'a'), 250);
console.log('FINANCEIRO OK');
