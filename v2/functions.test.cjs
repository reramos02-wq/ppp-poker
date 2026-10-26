const Module = require("module"); const assert = require("assert");
let sent = [], schema = 2, players = [{uid:"a",fcmTokens:["t1","t2"]},{uid:"b",fcmTokens:["t2","t3"]}];
const handlers = {};
const fake = {
  "firebase-functions/v2/firestore": { onDocumentUpdated:(o,f)=>{handlers.legacy=f;return f}, onDocumentWritten:(o,f)=>{handlers.v2=f;return f} },
  "firebase-admin/app": { initializeApp(){} },
  "firebase-admin/firestore": { FieldValue:{arrayRemove:x=>x}, getFirestore:()=>({
    doc:p=>({get:async()=>p==="config/schema"?{exists:true,data:()=>({version:schema})}:{exists:true,data:()=>({players})}}),
    collection:()=>({get:async()=>({docs:players.map(p=>({data:()=>p}))})}) }) },
  "firebase-admin/messaging": { getMessaging:()=>({ sendEachForMulticast: async m=>{ sent.push(m); return {responses:m.tokens.map(()=>({success:true}))}; } }) },
};
const orig = Module._load; Module._load = function(r,...a){ return fake[r] || orig.call(this,r,...a); };
require("./functions/index.js");
const ev = (b,a,id="e9")=>({params:{stageId:id}, data:{before:b===null?{exists:false}:{exists:true,data:()=>b}, after:a===null?{exists:false}:{exists:true,data:()=>a}}});
(async()=>{
  await handlers.v2(ev(null,{name:"Etapa 9",allowInscriptions:true,status:"upcoming"})); assert.equal(sent.length,1,"etapa nova aberta notifica");
  assert.deepEqual(sent[0].tokens.sort(),["t1","t2","t3"],"tokens únicos"); assert.equal(sent[0].data.tag,"inscricoes-e9");
  await handlers.v2(ev({allowInscriptions:false},{name:"E",allowInscriptions:true,status:"upcoming"})); assert.equal(sent.length,2,"reabertura notifica");
  await handlers.v2(ev({allowInscriptions:true},{name:"E",allowInscriptions:true,status:"upcoming"})); assert.equal(sent.length,2,"já aberta não notifica");
  await handlers.v2(ev({allowInscriptions:false},{name:"E",allowInscriptions:true,status:"finished"})); assert.equal(sent.length,2,"encerrada não notifica");
  await handlers.v2(ev({allowInscriptions:true},null)); assert.equal(sent.length,2,"apagada não notifica");
  schema=1; await handlers.v2(ev(null,{name:"X",allowInscriptions:true})); assert.equal(sent.length,2,"v2 inativo: ignora");
  const lv=(b,a)=>({data:{before:{data:()=>b},after:{data:()=>a}}});
  await handlers.legacy(lv({stages:[{id:"e1",allowInscriptions:false}]},{players,stages:[{id:"e1",name:"E1",allowInscriptions:true,status:"upcoming"}]})); assert.equal(sent.length,3,"legado ativo notifica");
  schema=2; await handlers.legacy(lv({stages:[]},{players,stages:[{id:"e1",name:"E1",allowInscriptions:true}]})); assert.equal(sent.length,3,"legado ignorado com v2 ativo");
  console.log("FUNCTIONS OK");
})().catch(e=>{console.error(e);process.exit(1)});
