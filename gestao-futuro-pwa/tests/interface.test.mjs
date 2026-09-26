import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
const read=p=>readFileSync(p,'utf8');
function setup(){
 const dom=new JSDOM(read('index.html'),{url:'https://example.test',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window;w.fetch=async()=>Response.json({ok:true,data:[]});w.AbortController=AbortController;w.AbortSignal=AbortSignal;w.alert=message=>{throw new Error(message)};w.scrollTo=()=>{};
 const c=dom.getInternalVMContext();for(const p of ['brand','core','reports','secretaria','gestao','comercial','integracoes'])vm.runInContext(read('app/'+p+'.js'),c);
 vm.runInContext('state.staffToken="fixture";state.role="staff";state.runMode="PRODUCAO"',c);
 return {dom,w,run:s=>vm.runInContext(s,c)};
}
for(const f of ['openCashReport([])','openStudentReport([])','openResponsibleReport([])','openMatriculaReport([])','openReceivablesReport([])','openAttendanceReport([])','openDocumentsReport({},[])','openClosingReport({})']){
 test('report dialog opens: '+f,()=>{const x=setup();try{x.run(f);assert.ok(x.w.document.querySelector('#modalRoot select'));assert.ok(x.w.document.querySelector('[data-close]').onclick)}finally{x.dom.window.close()}});
}
test('save, edit, failed update and manual synchronization preserve latest attendance',async()=>{
 const x=setup();const calls=[];let fail=false;let persisted=[];
 const products=[{ID_PRODUTO:'2027-I2',ANO_LETIVO:2027,PRODUTO:'Anuidade Infantil 2',CATEGORIA:'Mensalidade',SUBCATEGORIA:'Anuidade',ATIVO:'Sim',VALOR_BASE:7788,QTD_PARCELAS:1,'SEGMENTO_SÉRIE':'Infantil 2'}];
 x.w.fetch=async(url,opts)=>{
  const b=JSON.parse(opts.body);calls.push(b);
  if(b.action==='salvarAtendimento'){
   if(fail)throw new TypeError('network unavailable');
   persisted=[{...b.data,ID_ATENDIMENTO:'ATE-1'}];return Response.json({ok:true,data:{id:'ATE-1'}});
  }
  if(b.action==='bootstrapSecretaria')return Response.json({ok:true,data:{produtos:products,alunos:[],responsaveis:[]}});
  if(b.action==='listarAtendimentos')return Response.json({ok:true,data:persisted});
  return Response.json({ok:true,data:[]});
 };
 try{
  await x.run('renderAtendimento()');
  x.w.document.querySelector('#attName').value='ALUNO FICTICIO';
  x.w.document.querySelector('[name=RESPONSAVEL]').value='RESPONSAVEL FICTICIO';
  x.w.document.querySelector('#attSerie').value='Infantil 2';
  x.w.document.querySelector('#attSerie').dispatchEvent(new x.w.Event('change')); 
  await x.w.document.querySelector('#saveAttendance').onclick();
  assert.equal(x.run('state.currentAttendanceId'),'ATE-1');
  x.w.document.querySelector('#attName').value='ALUNO FICTICIO EDITADO';
  await x.w.document.querySelector('#saveAttendance').onclick();
  const writes=calls.filter(x=>x.action==='salvarAtendimento');assert.equal(writes.length,2);assert.notEqual(writes[0].data.CLIENT_REQUEST_ID,writes[1].data.CLIENT_REQUEST_ID);
  fail=true;x.w.document.querySelector('#attName').value='VERSAO PENDENTE';await x.w.document.querySelector('#saveAttendance').onclick();
  assert.equal(x.run('gfLocalAttendances().length'),1);
  assert.ok(x.w.document.querySelector('[data-sync-att="ATE-1"]'));
  assert.match(x.w.document.querySelector('#view').textContent,/VERSAO PENDENTE/);
  fail=false;await x.w.document.querySelector('[data-sync-att="ATE-1"]').onclick();
  assert.equal(x.run('gfLocalAttendances().length'),0);assert.equal(persisted[0].NOME_ALUNO,'VERSAO PENDENTE');
  const all=calls.filter(x=>x.action==='salvarAtendimento');assert.equal(all[2].data.CLIENT_REQUEST_ID,all[3].data.CLIENT_REQUEST_ID);
 }finally{x.dom.window.close()}
});

for(const f of ['openStudentForm({})','openRespForm([])','openMatForm({alunos:[],responsaveis:[],produtos:[]})']){
 test('school registration dialog opens: '+f,()=>{const x=setup();try{x.run(f);assert.ok(x.w.document.querySelector('#modalRoot form'))}finally{x.dom.window.close()}});
}
test('attendance deletion requires management authorization and calls the protected endpoint',async()=>{
 const x=setup();const calls=[];
 x.w.fetch=async(url,opts)=>{
  const b=JSON.parse(opts.body);calls.push(b);
  if(b.action==='loginGestao')return Response.json({ok:true,data:{ok:true,token:'admin-once'}});
  if(b.action==='excluirAtendimento')return Response.json({ok:true,data:{ok:true,id:b.id}});
  if(b.action==='logout')return Response.json({ok:true,data:{ok:true}});
  if(b.action==='bootstrapSecretaria')return Response.json({ok:true,data:{produtos:[],alunos:[],responsaveis:[]}});
  if(b.action==='listarAtendimentos')return Response.json({ok:true,data:[]});
  return Response.json({ok:true,data:[]});
 };
 try{
  x.run('state.backendCaps={attendanceDelete:true}');
  x.w.__row={a:{ID_ATENDIMENTO:'ATE-TESTE',NOME_ALUNO:'Aluno teste'},local:false};
  x.run('gfOpenDeleteAttendance(window.__row)');
  assert.ok(x.w.document.querySelector('#deleteAttendancePass'));
  x.w.document.querySelector('#deleteAttendancePass').value='senha-direcao';
  await x.w.document.querySelector('#confirmDeleteAttendance').onclick();
  assert.equal(calls.find(v=>v.action==='loginGestao')?.password,'senha-direcao');
  assert.equal(calls.find(v=>v.action==='excluirAtendimento')?.token,'admin-once');
  assert.equal(calls.find(v=>v.action==='excluirAtendimento')?.id,'ATE-TESTE');
  assert.ok(calls.some(v=>v.action==='logout'&&v.token==='admin-once'));
 }finally{x.dom.window.close()}
});

test('attendance PDF generation uses the bundled library and keeps a typical proposal on one A4 page',async()=>{
 const x=setup();try{
  const {jsPDF}=await import('jspdf');
  x.w.jspdf={jsPDF:function(...args){const d=new jsPDF(...args);d.save=()=>{x.w.generatedPdf=d.output();x.w.generatedPages=d.getNumberOfPages()};return d}};
  const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wlqk6sAAAAASUVORK5CYII=';
  x.run('gfPdfBrandPng=async()=>null');
  x.w.__pdfPixel=pixel;x.run('gfPdfImagePng=async()=>({data:window.__pdfPixel,ratio:1})');
  const rec={ID_ATENDIMENTO:'ATE-000003',NOME_ALUNO:'Thiago',RESPONSAVEL:'Alexsandra',SERIE_PRETENDIDA:'5º Ano',ANO_LETIVO:2027,TIPO_ALUNO:'Novato',TURNO:'Manhã',MODALIDADE:'Regular',TELEFONE:'85991392851',EMAIL:'thiapandrade@gmail.com',ETAPA:'Matriculado',STATUS:'Matriculado',VALOR_ANUIDADE:6552.73,PLANO_PARCELAS:12,VALOR_PRIMEIRA_FINAL:378.01,VALOR_PARCELA_FINAL:478.86,'DESCONTO_PRIMEIRA_%':25,'DESCONTO_PARCELAS_%':5,TOTAL_PLANO:6124.33,ECONOMIA_PLANO:428.40,TOTAL_PROPOSTA:8040.03};
  const itens=[
   {ID_PRODUTO:'MAT',PRODUTO:'Material Didático - Anos Iniciais',CATEGORIA:'Material Didático',VALOR_APRESENTADO:1571.40,OBSERVACAO:'Trilhas + complementares + literaturas + diário'},
   {ID_PRODUTO:'CAM',PRODUTO:'Camiseta gola V malha piquê',CATEGORIA:'Fardamento',VALOR_APRESENTADO:74.80},
   {ID_PRODUTO:'CAL',PRODUTO:'Calça comprida terbrim azul marinho',CATEGORIA:'Fardamento',VALOR_APRESENTADO:143},
   {ID_PRODUTO:'CAS',PRODUTO:'Casaco de moletom',CATEGORIA:'Fardamento',VALOR_APRESENTADO:126.50}
  ];
  x.w.__pdfRec=rec;x.w.__pdfItens=itens;
  await x.run('gfDownloadAttendancePdf(window.__pdfRec,window.__pdfItens)');
  assert.match(x.w.generatedPdf,/^%PDF-/);
  assert.equal(x.w.generatedPages,1);
 }finally{x.dom.window.close()}
});
