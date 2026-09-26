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
test('attendance PDF generation uses the bundled library and produces a PDF',async()=>{
 const x=setup();try{
  const {jsPDF}=await import('jspdf');
  x.w.jspdf={jsPDF:function(...args){const d=new jsPDF(...args);d.save=()=>{x.w.generatedPdf=d.output()};return d}};
  x.run('gfPdfBrandPng=async()=>null;gfPdfImagePng=async()=>null');
  await x.run('gfDownloadAttendancePdf({ID_ATENDIMENTO:"FIXTURE",NOME_ALUNO:"Aluno fictício",SERIE_PRETENDIDA:"Infantil 2",ANO_LETIVO:2027,TOTAL_PROPOSTA:7788},[])');
  assert.match(x.w.generatedPdf,/^%PDF-/);
 }finally{x.dom.window.close()}
});
