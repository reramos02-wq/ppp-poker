// Testes da estrutura do torneio: campos numéricos ⇄ texto padronizado lido pelo financeiro.
import fs from 'node:fs'; import vm from 'node:vm'; import assert from 'node:assert/strict';
const h = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const cut = (a, b) => h.slice(h.indexOf(a), h.indexOf(b));
const src = [cut('// Número no formato brasileiro', '// Default blind structure'), cut('function calcAvgStack', '// ── LOGO (vetorial)')].join('\n');
const ctx = { DB:{players:[]}, ACTIVE_SEASON:'2026', console, DEFAULT_KO_VALUE:25, DEFAULT_KO_PER_ENTRY:4 }; vm.createContext(ctx);
vm.runInContext(src + ';this.f={structToText,textToStruct,structValidate,getBuyinValues,calcAvgStack,parseBRL,parseChips}', ctx); const f = ctx.f; const J = o => JSON.parse(JSON.stringify(o));
// 1) padrões de fábrica: texto → campos → texto  (idêntico)
const NL = {buyin:'R$ 150 (20k fichas)', rebuy:'R$ 100 (20k) / R$ 180 (40k)', addon:'R$ 150 (40k fichas)', timechip:'5k início 1º nível'};
const KO = {buyin:'R$ 200 (20k fichas + KO)', rebuy:'R$ 200 (20k+KO) / R$ 300 (40k+KO)', addon:'R$ 200 (40k fichas)', timechip:'—'};
assert.deepEqual(J(f.structToText(f.textToStruct(NL),'nlholdem')), NL);
assert.deepEqual(J(f.structToText(f.textToStruct(KO),'knockout')), KO);
// 2) textos antigos (como estavam salvos) são lidos certo e valores financeiros não mudam
const OLD_KO = {buyin:'R$ 200 (20k fichas + 1 KO)', rebuy:'R$ 200 (20k+1KO) / R$ 300 (40k+1KO)', addon:'R$ 200 (40k fichas)', timechip:'—'};
const st = f.textToStruct(OLD_KO);
assert.deepEqual(JSON.parse(JSON.stringify(st)), {buyin:{v:200,k:20},rs:{v:200,k:20},rd:{v:300,k:40},addon:{v:200,k:40},tc:{on:false,k:0,lvl:1}});
const before = f.getBuyinValues(OLD_KO), after = f.getBuyinValues(f.structToText(st,'knockout'));
assert.deepEqual(JSON.parse(JSON.stringify(before)), JSON.parse(JSON.stringify(after)), 'valores do financeiro iguais antes/depois');
assert.equal(f.calcAvgStack({...OLD_KO, inscriptions:['a','b'], buyinData:[{uid:'a',rs:1,rd:1,addon:true}]}), f.calcAvgStack({...f.structToText(st,'knockout'), inscriptions:['a','b'], buyinData:[{uid:'a',rs:1,rd:1,addon:true}]}), 'stack médio igual');
// 3) decimais e milhar
const dec = {buyin:{v:12.5,k:1.5},rs:{v:0,k:0},rd:{v:0,k:0},addon:{v:0,k:0},tc:{on:false,k:0,lvl:1}};
const t = f.structToText(dec,'nlholdem'); assert.equal(t.buyin,'R$ 12,5 (1,5k fichas)'); assert.equal(t.rebuy,'—'); assert.equal(t.addon,'—');
assert.equal(f.parseBRL(t.buyin),12.5); assert.equal(f.parseChips(t.buyin),1500);
const big = f.structToText({...dec, buyin:{v:1500,k:100}},'nlholdem'); assert.equal(f.parseBRL(big.buyin),1500); assert.equal(f.parseChips(big.buyin),100000);
// 4) só RS (sem RD) e time chip com nível
const rsOnly = f.structToText({...dec, buyin:{v:100,k:20}, rs:{v:100,k:20}, tc:{on:true,k:2.5,lvl:3}},'nlholdem');
assert.equal(rsOnly.rebuy,'R$ 100 (20k)'); assert.equal(rsOnly.timechip,'2,5k início 3º nível');
assert.deepEqual(JSON.parse(JSON.stringify(f.textToStruct(rsOnly).tc)), {on:true,k:2.5,lvl:3});
// 5) validação
const ok = f.textToStruct(NL);
assert.equal(f.structValidate(ok,'nlholdem',null),'');
assert.match(f.structValidate({...ok,buyin:{v:0,k:20}},'nlholdem',null),/Buy-in/);
assert.match(f.structValidate({...ok,buyin:{v:150,k:0}},'nlholdem',null),/Buy-in/);
assert.match(f.structValidate({...ok,rs:{v:100,k:0}},'nlholdem',null),/Rebuy simples/);
assert.match(f.structValidate({...ok,rs:{v:0,k:0},rd:{v:180,k:40}},'nlholdem',null),/Rebuy duplo/);
assert.match(f.structValidate({...ok,buyin:{v:-5,k:20}},'nlholdem',null),/números/);
assert.match(f.structValidate({...ok,buyin:{v:NaN,k:20}},'nlholdem',null),/números/);
assert.match(f.structValidate({...ok,tc:{on:true,k:0,lvl:1}},'nlholdem',null),/Time chip/);
assert.match(f.structValidate(f.textToStruct(KO),'knockout',{value:0,per:4}),/KO/);
assert.equal(f.structValidate(f.textToStruct(KO),'knockout',{value:25,per:4}),'');
// 6) conciliação: variações de textos antigos mantêm exatamente os mesmos valores lidos pelo financeiro
const LEGACY = [
  {buyin:'R$ 150 (20k fichas)', rebuy:'R$ 100 (20k) / R$ 180 (40k)', addon:'R$ 150 (40k fichas)', timechip:'5k início 1º nível'},
  {buyin:'R$ 1.500,50 (100k fichas)', rebuy:'R$ 1.000 (100k)', addon:'', timechip:''},
  {buyin:'R$ 12,5 (1,5k fichas)', rebuy:'R$ 10 (1,5k+1KO) / R$ 20 (3k+1KO)', addon:'R$ 5 (1k fichas)', timechip:'2,5k início 3º nível'},
  {buyin:'R$ 200 (20k fichas + 1 KO)', rebuy:'R$ 200 (20k+1KO) / R$ 300 (40k+1KO)', addon:'R$ 200 (40k fichas)', timechip:'—'},
];
for (const r of LEGACY) for (const type of ['nlholdem','knockout']) {
  const re = J(f.structToText(f.textToStruct(r), type));
  assert.deepEqual(J(f.getBuyinValues(re)), J(f.getBuyinValues(r)), 'valores financeiros: '+r.buyin);
  assert.equal(f.parseChips(re.buyin), f.parseChips(r.buyin), 'fichas buy-in');
  assert.equal(f.parseChips(String(re.rebuy).split('/')[0]), f.parseChips(String(r.rebuy).split('/')[0]), 'fichas RS');
  assert.equal(f.parseChips(re.addon), f.parseChips(r.addon), 'fichas add-on');
  const mk = x => ({...x, inscriptions:['a','b','c'], buyinData:[{uid:'a',rs:2,rd:1,addon:true},{uid:'b',rs:1}]});
  assert.equal(f.calcAvgStack(mk(re)), f.calcAvgStack(mk(r)), 'stack médio');
}
console.log('ESTRUTURA OK');
