// Testes da estrutura v2: separar/montar etapa sem perder nada, e diffs de gravação (admin x jogador).
import fs from 'node:fs'; import vm from 'node:vm'; import assert from 'node:assert/strict';
const h = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const cut = (a, b) => h.slice(h.indexOf(a), h.indexOf(b));
const ctx = {console}; vm.createContext(ctx);
vm.runInContext(cut('// ── V2 PURO (início)', '// ── V2 PURO (fim)') + ';this.f={v2SplitStage,v2AssembleStages,v2Diff,v2Canon,v2NormStage,v2RegId}', ctx); const J = o => JSON.parse(JSON.stringify(o));
const f = new Proxy(ctx.f, {get:(t,k)=> (typeof t[k]==='function' ? (...a)=>{ const r=t[k](...a); return (r && typeof r==='object') ? J(r) : r; } : t[k])});
const stage = {id:'e1', name:'ETAPA 1', type:'knockout', date:'2026-10-10', status:'finished', inscriptions:['a','b','c','d'], lateList:['c','a'], results:[{playerId:'a',position:1,knockouts:2}], buyinData:[{uid:'a',buyins:1}], finance:{koValue:25,koPer:4}, draft:null, odd:{x:[1,2]}};
// 1) separar e montar devolve a mesma etapa (ordem de inscrições e de late preservada)
const sp = f.v2SplitStage(stage);
assert.ok(!('inscriptions' in sp.doc) && !('lateList' in sp.doc));
assert.equal(sp.regs.length, 4);
const regsData = sp.regs.map(r=>r.data);
const back = f.v2AssembleStages([J(sp.doc)], regsData)[0];
assert.equal(f.v2Canon(back), f.v2Canon(stage), 'ida e volta idêntica');
// embaralhar a ordem dos docs de inscrição não muda o resultado
assert.deepEqual(f.v2AssembleStages([J(sp.doc)], regsData.slice().reverse())[0].inscriptions, ['a','b','c','d']);
// duplicados e late fora das inscrições
const odd = {...stage, id:'e2', inscriptions:['a','a','b'], lateList:['z']};
const b2 = f.v2AssembleStages([J(f.v2SplitStage(odd).doc)], f.v2SplitStage(odd).regs.map(r=>r.data))[0];
assert.equal(f.v2Canon(b2), f.v2Canon(f.v2NormStage(odd)), 'duplicados normalizados; late solto preservado');
assert.deepEqual(b2.inscriptions, ['a','b']); assert.deepEqual(b2.lateList, ['z']);
// 2) diffs
const P = [{uid:'a',name:'A'},{uid:'b',name:'B'}];
const baseP = Object.fromEntries(P.map(p=>[p.uid, JSON.stringify(p)])); const baseS = {e1: JSON.stringify(stage)};
const L = o => J(o);
// sem mudanças → nada
let d = f.v2Diff(baseP, baseS, L(P), [L(stage)], {isAdmin:false, uid:'b'});
assert.equal(d.players.set.length+d.stages.set.length+d.regs.set.length+d.regs.del.length+d.blocked, 0);
// jogador se inscreve numa etapa: só um doc de inscrição, nada de etapa
let s2 = L(stage); s2.inscriptions.push('x');
d = f.v2Diff(baseP, baseS, L(P), [s2], {isAdmin:false, uid:'x', now:1000});
assert.equal(d.stages.set.length, 0); assert.equal(d.regs.set.length, 1); assert.equal(d.regs.set[0].id, 'e1__x'); assert.equal(d.regs.set[0].data.inscrito, true); assert.equal(d.blocked, 0);
// jogador tenta inscrever OUTRO uid → bloqueado
d = f.v2Diff(baseP, baseS, L(P), [s2], {isAdmin:false, uid:'b'}); assert.equal(d.regs.set.length, 0); assert.equal(d.blocked, 1);
// jogador tenta mudar resultado → bloqueado, nada gravado
let s3 = L(stage); s3.results[0].position = 9;
d = f.v2Diff(baseP, baseS, L(P), [s3], {isAdmin:false, uid:'b'}); assert.equal(d.stages.set.length, 0); assert.ok(d.blocked>=1);
// admin muda resultado → doc da etapa, sem mexer em inscrições
d = f.v2Diff(baseP, baseS, L(P), [s3], {isAdmin:true, uid:'adm'}); assert.equal(d.stages.set.length, 1); assert.equal(d.regs.set.length+d.regs.del.length, 0);
assert.equal(d.stages.set[0].results[0].position, 9);
// sair da etapa: remove o doc de inscrição; late
let s4 = L(stage); s4.inscriptions = s4.inscriptions.filter(u=>u!=='d');
d = f.v2Diff(baseP, baseS, L(P), [s4], {isAdmin:false, uid:'d'}); assert.deepEqual(d.regs.del, ['e1__d']);
let s5 = L(stage); s5.lateList = s5.lateList.filter(u=>u!=='a');
d = f.v2Diff(baseP, baseS, L(P), [s5], {isAdmin:false, uid:'a'}); assert.equal(d.regs.set.length, 1); assert.equal(d.regs.set[0].data.late, false);
// perfil: só o próprio
let P2 = L(P); P2[0].name = 'A2'; P2[1].name = 'B2';
d = f.v2Diff(baseP, baseS, P2, [L(stage)], {isAdmin:false, uid:'a'}); assert.deepEqual(d.players.set.map(p=>p.uid), ['a']); assert.equal(d.blocked, 1);
d = f.v2Diff(baseP, baseS, P2, [L(stage)], {isAdmin:true, uid:'adm'}); assert.equal(d.players.set.length, 2);
// exclusão (admin) de jogador e etapa
d = f.v2Diff(baseP, baseS, [P[0]], [], {isAdmin:true, uid:'adm', deleteMissing:true}); assert.deepEqual(d.players.del, ['b']); assert.deepEqual(d.stages.del, ['e1']); assert.equal(d.regs.del.length, 4);
d = f.v2Diff(baseP, baseS, [P[0]], [], {isAdmin:false, uid:'a', deleteMissing:true}); assert.equal(d.players.del.length+d.stages.del.length, 0); assert.ok(d.blocked>=2);
// remapear uid em tudo (vínculo): admin → etapa regravada, inscrição antiga some e a nova nasce
const remap = JSON.parse(JSON.stringify(stage).replaceAll('"a"','"A2"')); 
d = f.v2Diff(baseP, baseS, L(P), [remap], {isAdmin:true, uid:'adm', now:5});
assert.ok(d.regs.del.includes('e1__a') && d.regs.set.some(r=>r.id==='e1__A2'));
console.log('V2 OK');
