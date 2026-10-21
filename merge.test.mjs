import fs from 'node:fs'; import vm from 'node:vm'; import assert from 'node:assert/strict';
const h=fs.readFileSync('index.html','utf8');
const a=h.indexOf('function mergeById'), b=h.indexOf('async function commitDB');
const ctx={}; vm.createContext(ctx); vm.runInContext(h.slice(a,b)+';this.m={mergeById,mergeStage}',ctx);
const {mergeById,mergeStage}=ctx.m; const J=JSON.stringify;
const base={e1:J({id:'e1',inscriptions:['a','b']}),e2:J({id:'e2',n:1})};
// servidor: e1 ganhou 'c'; e2 mudou; e3 nova de outro. local: removeu 'b' de e1, não tocou e2, deletou nada
const server=[{id:'e1',inscriptions:['a','b','c']},{id:'e2',n:2},{id:'e3'}];
const local=[{id:'e1',inscriptions:['a']},{id:'e2',n:1}];
const r=mergeById(server,local,base,'id',mergeStage);
assert.equal(J(r.find(x=>x.id==='e1').inscriptions.sort()),J(['a','c']));
assert.equal(r.find(x=>x.id==='e2').n,2);        // não tocada aqui → versão do servidor
assert.ok(r.find(x=>x.id==='e3'));               // nova de outra pessoa → mantida
// exclusão local de e2 (estava na foto) → some; e3 continua
const r2=mergeById(server,[{id:'e1',inscriptions:['a','b']}],base,'id',mergeStage);
assert.ok(!r2.find(x=>x.id==='e2')); assert.ok(r2.find(x=>x.id==='e3'));
// etapa nova local entra
const r3=mergeById(server,[...local,{id:'e9'}],base,'id',mergeStage); assert.ok(r3.find(x=>x.id==='e9'));
console.log('MERGE OK');
