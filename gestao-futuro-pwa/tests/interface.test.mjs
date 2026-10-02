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


test('dashboard tuition table derives exact installment values and preserves historical baseline',()=>{
 const x=setup();try{
  x.w.__products=[
   {ID_PRODUTO:'ANU-INF-2027',CATEGORIA:'Mensalidade',SUBCATEGORIA:'Anuidade',PRODUTO:'Anuidade 2027 - Educação Infantil','SEGMENTO_SÉRIE':'Infantil 2 ao 5',VALOR_BASE:6386.52,'VALOR_PÓS_VENCIMENTO':6722.73,ANO_LETIVO:2027,ATIVO:'Sim'},
   {ID_PRODUTO:'ANU-AI-2027',CATEGORIA:'Mensalidade',SUBCATEGORIA:'Anuidade',PRODUTO:'Anuidade 2027 - Anos Iniciais','SEGMENTO_SÉRIE':'1º ao 5º Ano',VALOR_BASE:6552.73,'VALOR_PÓS_VENCIMENTO':6897.62,ANO_LETIVO:2027,ATIVO:'Sim'},
   {ID_PRODUTO:'ANU-AF-2027',CATEGORIA:'Mensalidade',SUBCATEGORIA:'Anuidade',PRODUTO:'Anuidade 2027 - Anos Finais','SEGMENTO_SÉRIE':'6º ao 9º Ano',VALOR_BASE:6719.03,'VALOR_PÓS_VENCIMENTO':7072.66,ANO_LETIVO:2027,ATIVO:'Sim'}
  ];
  const rows=x.run('dashTuitionFromCatalog(window.__products,2027)');
  assert.equal(rows.length,3);
  assert.equal(rows[0].annual,6386.52);
  assert.equal(rows[0].first12,491.28);
  assert.equal(rows[0].plan12,491.27);
  assert.equal(rows[2].first12,516.83);
  assert.equal(rows[2].plan12,516.85);
  assert.equal(x.run('GF_TUITION_HISTORY[2024].infantil.annual'),5053.68);
  assert.equal(x.run('GF_TUITION_HISTORY[2025].finais.annual'),5740.80);
 }finally{x.dom.window.close()}
});


test('commercial plan uses official first payment and catalog recurring value',()=>{
 const x=setup();try{
  x.w.__products=[
   {ID_PRODUTO:'ANU-INF-2027',ANO_LETIVO:2027,PRODUTO:'Anuidade 2027 - Educação Infantil',CATEGORIA:'Mensalidade',SUBCATEGORIA:'Anuidade',ATIVO:'Sim',VALOR_BASE:6270.40,QTD_PARCELAS:1,'SEGMENTO_SÉRIE':'Infantil 2 ao 5'},
   {ID_PRODUTO:'MEN-INF-12-2027',ANO_LETIVO:2027,PRODUTO:'Mensalidade regular - Infantil',CATEGORIA:'Mensalidade',SUBCATEGORIA:'Plano 12 parcelas',ATIVO:'Sim',VALOR_BASE:482.12,VALOR_PARCELA:482.12,QTD_PARCELAS:12,'SEGMENTO_SÉRIE':'Infantil 2 ao 5'},
   {ID_PRODUTO:'MEN-INF-11-2027',ANO_LETIVO:2027,PRODUTO:'Mensalidade regular - Infantil',CATEGORIA:'Mensalidade',SUBCATEGORIA:'Plano 11 parcelas',ATIVO:'Sim',VALOR_BASE:525.95,VALOR_PARCELA:525.95,QTD_PARCELAS:11,'SEGMENTO_SÉRIE':'Infantil 2 ao 5'}
  ];
  x.w.__plan=x.run('gfPlanCalc(window.__products,12,0,0)');
  assert.equal(x.w.__plan.firstBase,484.92);
  assert.equal(x.w.__plan.recurringBase,482.12);
  assert.equal(x.w.__plan.annualValue,6270.40);
  assert.equal(x.w.__plan.total,6270.36);
 }finally{x.dom.window.close()}
});

test('dashboard prefers explicit official installment values when catalog has them',()=>{
 const x=setup();try{
  x.w.__products=[
   {ID_PRODUTO:'ANU-INF-2026',CATEGORIA:'Mensalidade',SUBCATEGORIA:'Anuidade',PRODUTO:'Anuidade 2026 - Educação Infantil','SEGMENTO_SÉRIE':'Infantil 2 ao 5',VALOR_BASE:5805.93,'VALOR_PÓS_VENCIMENTO':6111.57,ANO_LETIVO:2026,ATIVO:'Sim'},
   {ID_PRODUTO:'MEN-INF-12-2026',CATEGORIA:'Mensalidade',SUBCATEGORIA:'Plano 12 parcelas',PRODUTO:'Mensalidade regular - Infantil','SEGMENTO_SÉRIE':'Infantil 2 ao 5',VALOR_BASE:446.41,VALOR_PARCELA:446.41,'VALOR_PÓS_VENCIMENTO':471.05,QTD_PARCELAS:12,ANO_LETIVO:2026,ATIVO:'Sim'},
   {ID_PRODUTO:'MEN-INF-11-2026',CATEGORIA:'Mensalidade',SUBCATEGORIA:'Plano 11 parcelas',PRODUTO:'Mensalidade regular - Infantil','SEGMENTO_SÉRIE':'Infantil 2 ao 5',VALOR_BASE:487.90,VALOR_PARCELA:487.90,'VALOR_PÓS_VENCIMENTO':513.87,QTD_PARCELAS:11,ANO_LETIVO:2026,ATIVO:'Sim'}
  ];
  const r=x.run('dashTuitionRowsForYear(window.__products,2026)[0]');
  assert.equal(r.first,449);
  assert.equal(r.plan12,446.41);
  assert.equal(r.plan12Post,471.05);
  assert.equal(r.plan11,487.90);
  assert.equal(r.plan11Post,513.87);
 }finally{x.dom.window.close()}
});


test('2027 audited values follow 8 percent annual and first-payment rule',()=>{
 const x=setup();try{
  x.w.__products=[
   {ID_PRODUTO:'ANU-INF-2027',CATEGORIA:'Mensalidade',SUBCATEGORIA:'Anuidade',PRODUTO:'Anuidade 2027 - Educação Infantil','SEGMENTO_SÉRIE':'Infantil 2 ao 5',VALOR_BASE:6270.40,'VALOR_PÓS_VENCIMENTO':6600.50,ANO_LETIVO:2027,ATIVO:'Sim'},
   {ID_PRODUTO:'MEN-INF-12-2027',CATEGORIA:'Mensalidade',SUBCATEGORIA:'Plano 12 parcelas',PRODUTO:'Mensalidade regular - Infantil','SEGMENTO_SÉRIE':'Infantil 2 ao 5',VALOR_BASE:482.12,VALOR_PARCELA:482.12,'VALOR_PÓS_VENCIMENTO':509.63,QTD_PARCELAS:12,ANO_LETIVO:2027,ATIVO:'Sim'},
   {ID_PRODUTO:'MEN-INF-11-2027',CATEGORIA:'Mensalidade',SUBCATEGORIA:'Plano 11 parcelas',PRODUTO:'Mensalidade regular - Infantil','SEGMENTO_SÉRIE':'Infantil 2 ao 5',VALOR_BASE:525.95,VALOR_PARCELA:525.95,'VALOR_PÓS_VENCIMENTO':555.96,QTD_PARCELAS:11,ANO_LETIVO:2027,ATIVO:'Sim'},
   {ID_PRODUTO:'ANU-AI-2027',CATEGORIA:'Mensalidade',SUBCATEGORIA:'Anuidade',PRODUTO:'Anuidade 2027 - Anos Iniciais','SEGMENTO_SÉRIE':'1º ao 5º Ano',VALOR_BASE:6433.59,'VALOR_PÓS_VENCIMENTO':6772.20,ANO_LETIVO:2027,ATIVO:'Sim'},
   {ID_PRODUTO:'MEN-AI-12-2027',CATEGORIA:'Mensalidade',SUBCATEGORIA:'Plano 12 parcelas',PRODUTO:'Mensalidade regular - Anos Iniciais','SEGMENTO_SÉRIE':'1º ao 5º Ano',VALOR_BASE:494.82,VALOR_PARCELA:494.82,'VALOR_PÓS_VENCIMENTO':523.04,QTD_PARCELAS:12,ANO_LETIVO:2027,ATIVO:'Sim'},
   {ID_PRODUTO:'MEN-AI-11-2027',CATEGORIA:'Mensalidade',SUBCATEGORIA:'Plano 11 parcelas',PRODUTO:'Mensalidade regular - Anos Iniciais','SEGMENTO_SÉRIE':'1º ao 5º Ano',VALOR_BASE:539.81,VALOR_PARCELA:539.81,'VALOR_PÓS_VENCIMENTO':570.59,QTD_PARCELAS:11,ANO_LETIVO:2027,ATIVO:'Sim'},
   {ID_PRODUTO:'ANU-AF-2027',CATEGORIA:'Mensalidade',SUBCATEGORIA:'Anuidade',PRODUTO:'Anuidade 2027 - Anos Finais','SEGMENTO_SÉRIE':'6º ao 9º Ano',VALOR_BASE:6596.87,'VALOR_PÓS_VENCIMENTO':6943.88,ANO_LETIVO:2027,ATIVO:'Sim'},
   {ID_PRODUTO:'MEN-AF-12-2027',CATEGORIA:'Mensalidade',SUBCATEGORIA:'Plano 12 parcelas',PRODUTO:'Mensalidade regular - Anos Finais','SEGMENTO_SÉRIE':'6º ao 9º Ano',VALOR_BASE:507.53,VALOR_PARCELA:507.53,'VALOR_PÓS_VENCIMENTO':536.45,QTD_PARCELAS:12,ANO_LETIVO:2027,ATIVO:'Sim'},
   {ID_PRODUTO:'MEN-AF-11-2027',CATEGORIA:'Mensalidade',SUBCATEGORIA:'Plano 11 parcelas',PRODUTO:'Mensalidade regular - Anos Finais','SEGMENTO_SÉRIE':'6º ao 9º Ano',VALOR_BASE:553.67,VALOR_PARCELA:553.67,'VALOR_PÓS_VENCIMENTO':585.21,QTD_PARCELAS:11,ANO_LETIVO:2027,ATIVO:'Sim'}
  ];
  const rows=x.run('dashTuitionRowsForYear(window.__products,2027)');
  assert.equal(rows[0].first,484.92);
  assert.equal(rows[0].annual,6270.40);
  assert.equal(rows[0].plan12,482.12);
  assert.equal(rows[0].plan11,525.95);
  assert.equal(rows[1].first,495.72);
  assert.equal(rows[2].first,506.52);
  assert.equal(rows[2].annualPost,6943.88);
  assert.equal(rows[2].plan12Post,536.45);
  assert.equal(rows[2].plan11Post,585.21);
 }finally{x.dom.window.close()}
});

test('secretaria matricula uses the published catalog for year and series',()=>{
 const x=setup();try{
  x.w.__b={alunos:[],responsaveis:[],produtos:[
   {ID_PRODUTO:'ANU-AF-2027',ANO_LETIVO:2027,ATIVO:'Sim',PUBLICADO_ATENDIMENTO:'Sim',CATEGORIA:'Mensalidade',SUBCATEGORIA:'Anuidade',PRODUTO:'Anuidade 2027 - Anos Finais','SEGMENTO_SÉRIE':'6º ao 9º Ano',VALOR_BASE:6596.87,QTD_PARCELAS:1},
   {ID_PRODUTO:'MEN-AF-12-2027',ANO_LETIVO:2027,ATIVO:'Sim',PUBLICADO_ATENDIMENTO:'Sim',CATEGORIA:'Mensalidade',SUBCATEGORIA:'Plano 12 parcelas',PRODUTO:'Mensalidade regular - Anos Finais','SEGMENTO_SÉRIE':'6º ao 9º Ano',VALOR_BASE:507.53,VALOR_PARCELA:507.53,QTD_PARCELAS:12},
   {ID_PRODUTO:'MEN-AF-11-2027',ANO_LETIVO:2027,ATIVO:'Sim',PUBLICADO_ATENDIMENTO:'Sim',CATEGORIA:'Mensalidade',SUBCATEGORIA:'Plano 11 parcelas',PRODUTO:'Mensalidade regular - Anos Finais','SEGMENTO_SÉRIE':'6º ao 9º Ano',VALOR_BASE:553.67,VALOR_PARCELA:553.67,QTD_PARCELAS:11},
   {ID_PRODUTO:'MAT-6-2027',ANO_LETIVO:2027,ATIVO:'Sim',PUBLICADO_ATENDIMENTO:'Sim',CATEGORIA:'Material Didático',PRODUTO:'Material Didático - 6º Ano','SEGMENTO_SÉRIE':'6º Ano',VALOR_BASE:1809,QTD_PARCELAS:10},
   {ID_PRODUTO:'HIDDEN-2027',ANO_LETIVO:2027,ATIVO:'Sim',PUBLICADO_ATENDIMENTO:'Não',CATEGORIA:'Serviço',PRODUTO:'Oculto','SEGMENTO_SÉRIE':'6º Ano',VALOR_BASE:1,QTD_PARCELAS:1}
  ]};
  x.run('openMatForm(window.__b)');
  const serie=x.w.document.querySelector('#matSerie');serie.value='6º Ano';serie.dispatchEvent(new x.w.Event('change'));
  const options=[...x.w.document.querySelectorAll('#matPlano option')].map(o=>o.value);
  assert.deepEqual(options,['','ANU-AF-2027','MEN-AF-12-2027','MEN-AF-11-2027']);
  assert.equal(x.w.document.querySelectorAll('[data-mat-service]').length,1);
  assert.equal(x.w.document.querySelector('[data-mat-service]').dataset.matService,'MAT-6-2027');
 }finally{x.dom.window.close()}
});


test('panfleto always prefers fresh published management catalog values',async()=>{
 const x=setup();try{
  const fresh=[
   {ID_PRODUTO:'ANU-INF-2027',ANO_LETIVO:2027,ATIVO:'Sim',PUBLICADO_ATENDIMENTO:'Sim',CATEGORIA:'Mensalidade',SUBCATEGORIA:'Anuidade',PRODUTO:'Anuidade 2027 - Educação Infantil','SEGMENTO_SÉRIE':'Infantil 2 ao 5',VALOR_BASE:6270.40,QTD_PARCELAS:1,ORDEM_EXIBICAO:1},
   {ID_PRODUTO:'MEN-INF-12-2027',ANO_LETIVO:2027,ATIVO:'Sim',PUBLICADO_ATENDIMENTO:'Sim',CATEGORIA:'Mensalidade',SUBCATEGORIA:'Plano 12 parcelas',PRODUTO:'Mensalidade regular - Infantil','SEGMENTO_SÉRIE':'Infantil 2 ao 5',VALOR_BASE:482.12,VALOR_PARCELA:482.12,QTD_PARCELAS:12,ORDEM_EXIBICAO:2},
   {ID_PRODUTO:'MAT-INF2-2027',ANO_LETIVO:2027,ATIVO:'Sim',PUBLICADO_ATENDIMENTO:'Sim',CATEGORIA:'Material Didático',PRODUTO:'Material Didático - Infantil 2','SEGMENTO_SÉRIE':'Infantil 2',VALOR_BASE:524.34,QTD_PARCELAS:1,ORDEM_EXIBICAO:10},
   {ID_PRODUTO:'OCULTO-2027',ANO_LETIVO:2027,ATIVO:'Sim',PUBLICADO_ATENDIMENTO:'Não',CATEGORIA:'Serviço',PRODUTO:'Produto oculto','SEGMENTO_SÉRIE':'Infantil 2',VALOR_BASE:999,QTD_PARCELAS:1,ORDEM_EXIBICAO:0}
  ];
  x.w.fetch=async(url,opts)=>{
   const b=JSON.parse(opts.body);
   if(b.action==='listarProdutosPublicos')return Response.json({ok:true,data:fresh});
   if(b.action==='getPanfletoSerie')return Response.json({ok:true,data:{config:{TITULO:'Infantil 2'},produtos:[{...fresh[0],VALOR_BASE:9999}]}});
   if(b.action==='bootstrapSecretaria')return Response.json({ok:true,data:{alunos:[],responsaveis:[],produtos:fresh}});
   return Response.json({ok:true,data:[]});
  };
  x.run('state.view="panfletos";state.navSeq=77;state.staffToken="fixture";state.flyerYear=2027;state.flyerSeries="Infantil 2"');
  await x.run('renderPanfletos()');
  const textContent=x.w.document.querySelector('#flyerArea').textContent;
  assert.match(textContent,/R\$\s*6\.270,40/);
  assert.match(textContent,/R\$\s*524,34/);
  assert.doesNotMatch(textContent,/9\.999/);
  assert.doesNotMatch(textContent,/Produto oculto/);
  assert.match(x.w.document.querySelector('#flyerCatalogSync').textContent,/sincronizada/i);
 }finally{x.dom.window.close()}
});

test('official catalog orders published products using management display order',()=>{
 const x=setup();try{
  x.w.__ps=[
   {ID_PRODUTO:'B',ANO_LETIVO:2027,ATIVO:'Sim',PUBLICADO_ATENDIMENTO:'Sim',CATEGORIA:'Serviço',PRODUTO:'Segundo','SEGMENTO_SÉRIE':'Todos',ORDEM_EXIBICAO:20},
   {ID_PRODUTO:'A',ANO_LETIVO:2027,ATIVO:'Sim',PUBLICADO_ATENDIMENTO:'Sim',CATEGORIA:'Serviço',PRODUTO:'Primeiro','SEGMENTO_SÉRIE':'Todos',ORDEM_EXIBICAO:10},
   {ID_PRODUTO:'X',ANO_LETIVO:2027,ATIVO:'Sim',PUBLICADO_ATENDIMENTO:'Não',CATEGORIA:'Serviço',PRODUTO:'Oculto','SEGMENTO_SÉRIE':'Todos',ORDEM_EXIBICAO:1}
  ];
  const ids=x.run('gfCatalog(window.__ps,2027,"6º Ano").map(p=>p.ID_PRODUTO)');
  assert.deepEqual(ids,['A','B']);
 }finally{x.dom.window.close()}
});


test('veteran attendance separates suggested and confirmed series for 2027',async()=>{
 const x=setup();try{
  const student={ID_ALUNO:'ALU-6',NOME_COMPLETO:'Aluno Veterano','SÉRIE':'6º Ano',SERIE_ORIGEM_2026:'6º Ano',PROXIMA_SERIE_2027:'7º Ano',TIPO_ALUNO:'Veterano',MATRICULA_ORIGEM:'2026001',STATUS:'Ativo'};
  const products=[
   {ID_PRODUTO:'ANU-AF-2027',ANO_LETIVO:2027,ATIVO:'Sim',PUBLICADO_ATENDIMENTO:'Sim',CATEGORIA:'Mensalidade',SUBCATEGORIA:'Anuidade',PRODUTO:'Anuidade 2027','SEGMENTO_SÉRIE':'6º ao 9º Ano',VALOR_BASE:6596.87,QTD_PARCELAS:1},
   {ID_PRODUTO:'MEN-AF-12-2027',ANO_LETIVO:2027,ATIVO:'Sim',PUBLICADO_ATENDIMENTO:'Sim',CATEGORIA:'Mensalidade',SUBCATEGORIA:'Plano 12 parcelas',PRODUTO:'Mensalidade','SEGMENTO_SÉRIE':'6º ao 9º Ano',VALOR_BASE:507.53,VALOR_PARCELA:507.53,QTD_PARCELAS:12}
  ];
  x.w.fetch=async(url,opts)=>{
   const b=JSON.parse(opts.body);
   if(b.action==='bootstrapSecretaria')return Response.json({ok:true,data:{alunos:[student],matriculas:[{'ID_MATRÍCULA':'MAT-2026',ID_ALUNO:'ALU-6',ANO_LETIVO:2026,'SÉRIE':'6º Ano'}],responsaveis:[],produtos:products}});
   if(b.action==='listarProdutosPublicos')return Response.json({ok:true,data:products});
   if(b.action==='listarAtendimentos')return Response.json({ok:true,data:[]});
   return Response.json({ok:true,data:[]});
  };
  x.run('state.view="atendimento";state.navSeq=1;state.attendanceYear=2027');
  await x.run('renderAtendimento()');
  const sel=x.w.document.querySelector('#attStudent');sel.value='ALU-6';sel.dispatchEvent(new x.w.Event('change'));
  assert.equal(x.w.document.querySelector('#attYear').value,'2027');
  assert.equal(x.w.document.querySelector('#attCurrentSeries').value,'6º Ano');
  assert.equal(x.w.document.querySelector('#attSuggestedSeries').value,'7º Ano');
  assert.equal(x.w.document.querySelector('#attSerie').value,'7º Ano');
  assert.equal(x.w.document.querySelector('#attConfirmedSeriesHidden').value,'7º Ano');
  assert.equal(x.w.document.querySelector('#attRematriculaCard').classList.contains('hidden'),false);
  const sit=x.w.document.querySelector('#attProgressionSituation');sit.value='Retido / repetir série';sit.dispatchEvent(new x.w.Event('change'));
  assert.equal(x.w.document.querySelector('#attSerie').value,'6º Ano');
  assert.equal(x.w.document.querySelector('#attConfirmedSeriesHidden').value,'6º Ano');
 }finally{x.dom.window.close()}
});

test('new rematricula uses suggested series but lets school confirm retention',()=>{
 const x=setup();try{
  const student={ID_ALUNO:'ALU-6',NOME_COMPLETO:'Aluno Veterano','SÉRIE':'6º Ano',SERIE_ORIGEM_2026:'6º Ano',PROXIMA_SERIE_2027:'7º Ano',TIPO_ALUNO:'Veterano',MATRICULA_ORIGEM:'2026001',STATUS:'Ativo'};
  const products=[
   {ID_PRODUTO:'ANU-AF-2027',ANO_LETIVO:2027,ATIVO:'Sim',PUBLICADO_ATENDIMENTO:'Sim',CATEGORIA:'Mensalidade',SUBCATEGORIA:'Anuidade',PRODUTO:'Anuidade 2027','SEGMENTO_SÉRIE':'6º ao 9º Ano',VALOR_BASE:6596.87,QTD_PARCELAS:1},
   {ID_PRODUTO:'MEN-AF-12-2027',ANO_LETIVO:2027,ATIVO:'Sim',PUBLICADO_ATENDIMENTO:'Sim',CATEGORIA:'Mensalidade',SUBCATEGORIA:'Plano 12 parcelas',PRODUTO:'Mensalidade','SEGMENTO_SÉRIE':'6º ao 9º Ano',VALOR_BASE:507.53,VALOR_PARCELA:507.53,QTD_PARCELAS:12}
  ];
  x.run('openMatForm({alunos:window.__a=[{ID_ALUNO:"ALU-6",NOME_COMPLETO:"Aluno Veterano","SÉRIE":"6º Ano",SERIE_ORIGEM_2026:"6º Ano",PROXIMA_SERIE_2027:"7º Ano",TIPO_ALUNO:"Veterano",MATRICULA_ORIGEM:"2026001",STATUS:"Ativo"}],responsaveis:[],produtos:window.__p='+JSON.stringify(products)+',matriculas:[{"ID_MATRÍCULA":"MAT-2026",ID_ALUNO:"ALU-6",ANO_LETIVO:2026,"SÉRIE":"6º Ano"}]})');
  const search=x.w.document.querySelector('#matAlunoSearch');search.value='Aluno Veterano — 6º Ano — 2026001';search.dispatchEvent(new x.w.Event('change'));
  assert.equal(x.w.document.querySelector('#matType').value,'Veterano');
  assert.equal(x.w.document.querySelector('#matOriginSeries').value,'6º Ano');
  assert.equal(x.w.document.querySelector('#matSuggestedSeries').value,'7º Ano');
  assert.equal(x.w.document.querySelector('#matSerie').value,'7º Ano');
  const sit=x.w.document.querySelector('#matProgressionSituation');sit.value='Retido / repetir série';sit.dispatchEvent(new x.w.Event('change'));
  assert.equal(x.w.document.querySelector('#matSerie').value,'6º Ano');
 }finally{x.dom.window.close()}
});


test('document dialog accepts multiple device files and drag-drop',async()=>{
 const x=setup();try{
  x.w.fetch=async(url,opts)=>{
   const b=opts?JSON.parse(opts.body):{};
   if(b.action==='bootstrapSecretaria')return Response.json({ok:true,data:{alunos:[{ID_ALUNO:'ALU-1',NOME_COMPLETO:'Aluno Teste','SÉRIE':'8º Ano',MATRICULA_ORIGEM:'2024010',STATUS:'Ativo'}],matriculas:[{'ID_MATRÍCULA':'MAT-1',ID_ALUNO:'ALU-1',ANO_LETIVO:2027,'SÉRIE':'9º Ano'}],responsaveis:[]}});
   if(b.action==='listarDocumentosAluno')return Response.json({ok:true,data:[]});
   return Response.json({ok:true,data:[]});
  };
  x.run('state.docsStudentId="ALU-1"');
  await x.run('renderDocumentos()');
  x.w.document.querySelector('#addStudentDoc').click();
  const input=x.w.document.querySelector('#docFilesInput');
  assert.ok(input);
  assert.equal(input.multiple,true);
  assert.match(input.getAttribute('accept'),/pdf/);
  assert.ok(x.w.document.querySelector('#docDropZone'));
  assert.match(x.w.document.querySelector('#modalRoot').textContent,/Arraste e solte os documentos aqui/);
  assert.match(x.w.document.querySelector('#modalRoot').textContent,/Organização automática no Drive/);
 }finally{x.dom.window.close()}
});


test('matriculas page renders even without rematricula action buttons',async()=>{
 const x=setup();try{
  x.w.fetch=async(url,opts)=>{
   const b=opts?JSON.parse(opts.body):{};
   if(b.action==='bootstrapSecretaria')return Response.json({ok:true,data:{
    alunos:[{ID_ALUNO:'ALU-1',NOME_COMPLETO:'Aluno Teste','SÉRIE':'8º Ano',STATUS:'Ativo'}],
    matriculas:[{'ID_MATRÍCULA':'MAT-1',ID_ALUNO:'ALU-1',ANO_LETIVO:2026,'SÉRIE':'8º Ano',TIPO_MATRICULA:'Novato',PLANO_PARCELAS:12,VALOR_ANUIDADE_CONTRATADO:6000,STATUS:'Ativa'}],
    itensContrato:[],responsaveis:[],produtos:[]
   }});
   if(b.action==='listarProdutosPublicos')return Response.json({ok:true,data:[]});
   return Response.json({ok:true,data:[]});
  };
  await x.run('renderMatriculas()');
  assert.match(x.w.document.querySelector('#view').textContent,/Aluno Teste/);
  assert.equal(x.w.document.querySelectorAll('[data-correct-remat]').length,0);
  assert.equal(x.w.document.querySelectorAll('[data-remat-pending]').length,0);
 }finally{x.dom.window.close()}
});


test('initial investment excludes annual plan and recurring STI',()=>{
 const x=setup();try{
  const rec={VALOR_PRIMEIRA_FINAL:419.30,VALOR_ANUIDADE:6500,TOTAL_PLANO:6500};
  const itens=[
   {ID_PRODUTO:'MAT-2027',PRODUTO:'Material Didático',CATEGORIA:'Material Didático',VALOR_APRESENTADO:1500,QTD:1},
   {ID_PRODUTO:'STI-INF-2027',PRODUTO:'Sistema de Tempo Integral',CATEGORIA:'Adicional',OBSERVACAO:'S.T.I. • 12 parcelas',VALOR_APRESENTADO:654.50,QTD:1},
   {ID_PRODUTO:'FAR-INF-2027',PRODUTO:'Camiseta regata',CATEGORIA:'Fardamento',VALOR_APRESENTADO:66,QTD:1}
  ];
  x.w.__rec=rec;x.w.__items=itens;
  assert.equal(x.run('gfInitialInvestment(window.__rec,window.__items)'),1985.30);
  assert.equal(x.run('gfIsRecurringStiProduct(window.__items[1])'),true);
  assert.equal(x.run('gfInitialExtrasFromItems(window.__items)'),1566);
 }finally{x.dom.window.close()}
});

test('STI uniform is not treated as recurring STI and uses launch uniform asset',()=>{
 const x=setup();try{
  const p={ID_PRODUTO:'FAR-STI-KIT-2027',CATEGORIA:'Fardamento',SUBCATEGORIA:'S.T.I.',PRODUTO:'Conjunto do Sistema de Tempo Integral','SEGMENTO_SÉRIE':'Infantil 2 ao 5 • 1º ao 5º Ano',VALOR_BASE:''};
  x.w.__p=p;
  assert.equal(x.run('gfIsStiUniformProduct(window.__p)'),true);
  assert.equal(x.run('gfIsRecurringStiProduct(window.__p)'),false);
  assert.equal(x.run('gfUniformAssetKeyForProduct(window.__p,"Infantil 4")'),'lancamentos');
  assert.equal(x.run('gfUniformAssetKeyForProduct(window.__p,"3º Ano")'),'lancamentos');
 }finally{x.dom.window.close()}
});

test('attendance shows dedicated STI budget and STI uniform for eligible 2027 student',async()=>{
 const x=setup();try{
  const products=[
   {ID_PRODUTO:'ANU-INF-2027',ANO_LETIVO:2027,PRODUTO:'Anuidade 2027 - Educação Infantil',CATEGORIA:'Mensalidade',SUBCATEGORIA:'Anuidade',ATIVO:'Sim',PUBLICADO_ATENDIMENTO:'Sim',VALOR_BASE:6270.40,QTD_PARCELAS:1,'SEGMENTO_SÉRIE':'Infantil 2 ao 5'},
   {ID_PRODUTO:'MEN-INF-12-2027',ANO_LETIVO:2027,PRODUTO:'Mensalidade regular - Infantil',CATEGORIA:'Mensalidade',SUBCATEGORIA:'Plano 12 parcelas',ATIVO:'Sim',PUBLICADO_ATENDIMENTO:'Sim',VALOR_BASE:482.12,VALOR_PARCELA:482.12,QTD_PARCELAS:12,'SEGMENTO_SÉRIE':'Infantil 2 ao 5'},
   {ID_PRODUTO:'STI-INF-2027',ANO_LETIVO:2027,PRODUTO:'Sistema de Tempo Integral',CATEGORIA:'Adicional',SUBCATEGORIA:'S.T.I.',ATIVO:'Sim',PUBLICADO_ATENDIMENTO:'Sim',VALOR_BASE:654.50,VALOR_PARCELA:654.50,QTD_PARCELAS:12,'SEGMENTO_SÉRIE':'Infantil 2 ao 5'},
   {ID_PRODUTO:'FAR-STI-KIT-2027',ANO_LETIVO:2027,PRODUTO:'Conjunto do Sistema de Tempo Integral',CATEGORIA:'Fardamento',SUBCATEGORIA:'S.T.I.',ATIVO:'Sim',PUBLICADO_ATENDIMENTO:'Sim',VALOR_BASE:'','SEGMENTO_SÉRIE':'Infantil 2 ao 5 • 1º ao 5º Ano'}
  ];
  x.w.fetch=async(url,opts)=>{
   const b=opts?JSON.parse(opts.body):{};
   if(b.action==='bootstrapSecretaria')return Response.json({ok:true,data:{alunos:[],matriculas:[],responsaveis:[],produtos:products}});
   if(b.action==='listarProdutosPublicos')return Response.json({ok:true,data:products});
   if(b.action==='listarAtendimentos')return Response.json({ok:true,data:[]});
   return Response.json({ok:true,data:[]});
  };
  x.run('state.attendanceYear=2027');
  await x.run('renderAtendimento()');
  x.w.document.querySelector('#attSerie').value='Infantil 4';
  x.w.document.querySelector('#attSerie').dispatchEvent(new x.w.Event('change'));
  assert.match(x.w.document.querySelector('#catalogArea').textContent,/Orçamento do tempo integral/);
  assert.match(x.w.document.querySelector('#catalogArea').textContent,/12x de R.*654,50/);
  assert.match(x.w.document.querySelector('#catalogArea').textContent,/Conjunto do Sistema de Tempo Integral/);
  assert.match(x.w.document.querySelector('#catalogArea').textContent,/Sob consulta/);
 }finally{x.dom.window.close()}
});


test('CEP lookup fills address data and compatibility payload preserves it',async()=>{
 const x=setup();try{
  x.w.fetch=async(url)=>{
   if(String(url).includes('viacep.com.br'))return Response.json({cep:'60130-000',logradouro:'Avenida Beira Mar',bairro:'Meireles',localidade:'Fortaleza',uf:'CE'});
   return Response.json({ok:true,data:[]});
  };
  const a=await x.run('gfLookupCep("60130000")');
  assert.equal(a.LOGRADOURO,'Avenida Beira Mar');
  assert.equal(a.BAIRRO,'Meireles');
  assert.equal(a.CIDADE,'Fortaleza');
  assert.equal(a.UF,'CE');
  x.w.__addr={OBSERVACAO:'Família interessada',CEP:'60130-000',LOGRADOURO:'Avenida Beira Mar',BAIRRO:'Meireles',CIDADE:'Fortaleza',UF:'CE',NUMERO:'100',COMPLEMENTO:'Apto 501'};
  const payload=x.run('gfPayloadWithAddressCompat(window.__addr)');
  assert.match(payload.OBSERVACAO,/GF_ENDERECO/);
  x.w.__payload=payload;
  const restored=x.run('gfHydrateAddressCompat(window.__payload)');
  assert.equal(restored.NUMERO,'100');
  assert.equal(restored.COMPLEMENTO,'Apto 501');
  assert.equal(restored.OBSERVACAO,'Família interessada');
 }finally{x.dom.window.close()}
});

test('workspace recovery restores the draft instead of restarting attendance',()=>{
 const x=setup();try{
  x.w.localStorage.setItem('gestao_futuro_atendimento_rascunho_v1',JSON.stringify({MODO_REGISTRO:'PRODUCAO',ID_ATENDIMENTO:'',NOME_ALUNO:'Aluno em atendimento',RESPONSAVEL:'Responsável',SERIE_PRETENDIDA:'4º Ano',ETAPA:'Proposta',CEP:'60130-000',NUMERO:'123',ITENS:['MAT-1']}));
  assert.equal(x.run('gfPrepareAttendanceResumeFromDraft()'),true);
  assert.equal(x.run('state.resumeAttendance.NOME_ALUNO'),'Aluno em atendimento');
  assert.equal(x.run('state.attendanceStage'),'Proposta');
  assert.equal(x.run('state.attendanceItems.has("MAT-1")'),true);
 }finally{x.dom.window.close()}
});

test('idle privacy screen waits 30 minutes and restores workspace',()=>{
 const start=read('app/start.js');
 assert.match(start,/HOME_IDLE_MS = 30 \* 60 \* 1000/);
 assert.match(start,/gfRememberWorkspace\(state\.view\)/);
 assert.match(start,/gfRestoreWorkspace/);
});


test('STI stays in 12 installments and synchronizes with regular plan',()=>{
 const x=setup();try{
  x.w.__p12={n:12,firstFinal:599,recurringFinal:541.15};
  x.w.__p11={n:11,firstFinal:599,recurringFinal:594.49};
  let s=x.run('gfStiPlanSync(window.__p12,654.50)');
  assert.equal(s.stiInstallments,12);
  assert.equal(s.alignedInstallments,12);
  assert.equal(s.stiOnlyInstallments,0);
  assert.equal(s.combinedValue,1195.65);
  assert.match(s.label,/1ª parcela regular de R.*599,00/);
  assert.match(s.label,/12x de R.*1\.195,65/);
  s=x.run('gfStiPlanSync(window.__p11,654.50)');
  assert.equal(s.stiInstallments,12);
  assert.equal(s.alignedInstallments,11);
  assert.equal(s.stiOnlyInstallments,1);
  assert.equal(s.combinedValue,1248.99);
  assert.match(s.label,/11x de R.*1\.248,99/);
  assert.match(s.label,/1x final de R.*654,50 somente S\.T\.I\./);
 }finally{x.dom.window.close()}
});


test('official 2026 document checklist applies folder colors and grade rules',()=>{
 const x=setup();try{
  x.w.__aluno={TIPO_ALUNO:'Novato','SÉRIE':'3º Ano'};
  x.w.__mat={TIPO_MATRICULA:'Novato','SÉRIE':'3º Ano',ANO_LETIVO:2026};
  const docs=x.run('gfDocs2026ForStudent(window.__aluno,window.__mat)');
  assert.ok(docs.some(d=>d.id==='DOC-NOV-003'&&/amarela/.test(d.documento)));
  assert.ok(docs.some(d=>d.id==='DOC-NOV-010'));
  assert.ok(docs.some(d=>d.id==='DOC-NOV-011'));
  assert.ok(docs.some(d=>d.id==='DOC-NOV-009'&&/16\.929/.test(d.condicao)));
  assert.ok(docs.some(d=>d.id==='DOC-NOV-015'));
  assert.ok(docs.some(d=>/17\/01\/2025/.test(d.prazo)));
 }finally{x.dom.window.close()}
});

test('veteran checklist hides novato-only requirements',()=>{
 const x=setup();try{
  x.w.__aluno={TIPO_ALUNO:'Veterano','SÉRIE':'7º Ano'};
  x.w.__mat={TIPO_MATRICULA:'Veterano','SÉRIE':'7º Ano',ANO_LETIVO:2026};
  const docs=x.run('gfDocs2026ForStudent(window.__aluno,window.__mat)');
  assert.equal(docs.some(d=>d.id==='DOC-NOV-003'),false);
  assert.equal(docs.some(d=>d.id==='DOC-NOV-004'),false);
  assert.equal(docs.some(d=>d.id==='DOC-NOV-009'),true);
  assert.equal(docs.some(d=>d.id==='DOC-NOV-012'),true);
 }finally{x.dom.window.close()}
});

test('official checklist source is present in the Secretaria documents UI',()=>{
 const src=read('app/secretaria.js');
 assert.match(src,/SECRETARIA • DOCUMENTAÇÃO 2026/);
 assert.match(src,/Gerar .*pendência\(s\) no checklist/);
 assert.match(src,/Histórico Escolar original ou declaração provisória/);
 assert.match(src,/Comprovante de pagamento da 1ª parcela da anuidade de 2026/);
});


test('flyer documents switch between novato and veterano',()=>{
 const x=setup();try{
  x.w.__cfg={};
  let d=x.run('gfFlyerDocumentRules(2026,"3º Ano","Novato",window.__cfg)');
  assert.equal(d.tipo,'Novato');
  assert.ok(d.items.some(i=>/Pasta escolar amarela/.test(i.t)));
  assert.ok(d.items.some(i=>/Histórico Escolar/.test(i.t)));
  assert.ok(d.items.some(i=>/1ª parcela/.test(i.t)));
  d=x.run('gfFlyerDocumentRules(2026,"3º Ano","Veterano",window.__cfg)');
  assert.equal(d.tipo,'Veterano');
  assert.equal(d.items.some(i=>/Pasta escolar/.test(i.t)),false);
  assert.equal(d.items.some(i=>/Histórico Escolar/.test(i.t)),false);
  assert.ok(d.items.some(i=>/Cartão de Vacinação/.test(i.t)));
  assert.ok(d.items.some(i=>/Requerimento de matrícula 2026/.test(i.t)));
 }finally{x.dom.window.close()}
});

test('flyer type selector is integrated with attendance shortcut',()=>{
 const src=read('app/comercial.js');
 assert.match(src,/id='flyerStudentType'/);
 assert.match(src,/state\.flyerStudentType/);
 assert.match(src,/\$\("#attType"\)\?\.value\|\|"Novato"/);
 assert.match(src,/gfFlyerDocumentsMarkup/);
});


test('management module centralizes documents for Secretaria and flyer',()=>{
 const src=read('app/gestao.js');
 assert.match(src,/function renderDocumentacaoGestao\(/);
 assert.match(src,/Fonte central da Gestão para Secretaria e Panfletos/);
 assert.match(src,/gfChecklistRowsForProfile/);
 assert.match(src,/Abrir no panfleto/);
 assert.match(src,/PUBLICADO_SECRETARIA/);
 assert.match(src,/PUBLICADO_PANFLETO/);
});

test('flyer consumes central management document cache when available',()=>{
 const x=setup();try{
  x.run('state.docRulesCache={2026:{rows:[{ID_REGRA:"X1",TIPO_MATRICULA:"Novato",PUBLICO:"Aluno",SERIE_APLICAVEL:"Todos",DOCUMENTO:"Documento da Gestão",OBRIGATORIO:"Sim",CONDICAO:"Sempre",PRAZO:"Na matrícula",ATIVO:"Sim",PUBLICADO_PANFLETO:"Sim",PUBLICADO_SECRETARIA:"Sim"}]}}');
  const d=x.run('gfFlyerDocumentRules(2026,"3º Ano","Novato",{})');
  assert.equal(d.source,'gestao');
  assert.ok(d.items.some(i=>i.t==='Documento da Gestão'));
 }finally{x.dom.window.close()}
});


test('series adjustment wizard filters products and previews percentage',()=>{
 const x=setup();try{
  x.w.__products=[
   {ID_PRODUTO:'INF-ANU',ANO_LETIVO:2026,PRODUTO:'Anuidade Infantil',CATEGORIA:'Mensalidade',ATIVO:'Sim',VALOR_BASE:5805.93,'SEGMENTO_SÉRIE':'Infantil 2 ao 5'},
   {ID_PRODUTO:'AI-MAT',ANO_LETIVO:2026,PRODUTO:'Material Didático Anos Iniciais',CATEGORIA:'Material Didático',ATIVO:'Sim',VALOR_BASE:1000,'SEGMENTO_SÉRIE':'1º ao 5º Ano'},
   {ID_PRODUTO:'AF-UNI',ANO_LETIVO:2026,PRODUTO:'Fardamento Anos Finais',CATEGORIA:'Fardamento',ATIVO:'Sim',VALOR_BASE:200,'SEGMENTO_SÉRIE':'6º ao 9º Ano'}
  ];
  let rows=x.run('prodSeriesWizardRows(window.__products,2026,"3º Ano")');
  assert.equal(rows.length,1);assert.equal(rows[0].ID_PRODUTO,'AI-MAT');
  rows=x.run('prodSeriesWizardRows(window.__products,2026,"Infantil 4")');
  assert.equal(rows.length,1);assert.equal(rows[0].ID_PRODUTO,'INF-ANU');
  assert.equal(x.run('prodPreviewValue(1000,8)'),1080);
 }finally{x.dom.window.close()}
});

test('series adjustment wizard publishes the new base year to all operational modules',()=>{
 const src=read('app/gestao.js');
 assert.match(src,/ASSISTENTE DE REAJUSTE POR SÉRIE/);
 assert.match(src,/Ano anterior • origem/);
 assert.match(src,/Novo ano-base/);
 assert.match(src,/Reajuste geral \(%\)/);
 assert.match(src,/Publicar novos valores e sincronizar/);
 assert.match(src,/Atendimento, Secretaria, Panfletos e Matrícula/);
 assert.match(src,/aplicarReajusteIndividual/);
});


test('tuition plan calculator closes annuality for 1+12 and 1+11',()=>{
 const x=setup();try{
  x.w.__bundle={
    annual:{VALOR_BASE:5805.93},
    first:{VALOR_BASE:449},
    p12:{VALOR_BASE:446.41,VALOR_PARCELA:446.41},
    p11:{VALOR_BASE:487.90,VALOR_PARCELA:487.90}
  };
  const calc=x.run('prodTuitionPlanCalc(window.__bundle,8,8)');
  assert.equal(calc.annual,6270.40);
  assert.equal(calc.first,484.92);
  assert.equal(calc.p12,482.12);
  assert.equal(calc.p11,525.95);
  assert.equal(calc.check12,6270.40);
  assert.equal(calc.check11,6270.40);
 }finally{x.dom.window.close()}
});

test('plan calculation uses official first installment product when available',()=>{
 const x=setup();try{
  x.w.__products=[
   {ID_PRODUTO:'ANU-INF-2027',ANO_LETIVO:2027,CATEGORIA:'Mensalidade',SUBCATEGORIA:'Anuidade',PRODUTO:'Anuidade 2027 - Educação Infantil',VALOR_BASE:6270.40,'SEGMENTO_SÉRIE':'Infantil 2 ao 5'},
   {ID_PRODUTO:'PRI-INF-2027',ANO_LETIVO:2027,CATEGORIA:'Mensalidade',SUBCATEGORIA:'1ª Parcela',PRODUTO:'1ª Parcela regular - Educação Infantil',VALOR_BASE:484.92,VALOR_PARCELA:484.92,QTD_PARCELAS:1,'SEGMENTO_SÉRIE':'Infantil 2 ao 5'},
   {ID_PRODUTO:'MEN-INF-12-2027',ANO_LETIVO:2027,CATEGORIA:'Mensalidade',SUBCATEGORIA:'Plano 12 parcelas',PRODUTO:'Mensalidade regular - Infantil',VALOR_BASE:482.12,VALOR_PARCELA:482.12,QTD_PARCELAS:12,'SEGMENTO_SÉRIE':'Infantil 2 ao 5'},
   {ID_PRODUTO:'MEN-INF-11-2027',ANO_LETIVO:2027,CATEGORIA:'Mensalidade',SUBCATEGORIA:'Plano 11 parcelas',PRODUTO:'Mensalidade regular - Infantil',VALOR_BASE:525.95,VALOR_PARCELA:525.95,QTD_PARCELAS:11,'SEGMENTO_SÉRIE':'Infantil 2 ao 5'}
  ];
  const p=x.run('gfPlanCalc(window.__products,12,0,0)');
  assert.equal(p.firstBase,484.92);
  assert.equal(p.recurringBase,482.12);
  assert.equal(p.annualValue,6270.40);
 }finally{x.dom.window.close()}
});

test('values wizard exposes both payment plans and exact annuality formula',()=>{
 const src=read('app/gestao.js');
 assert.match(src,/Plano A • 1ª \+ 12x/);
 assert.match(src,/Plano B • 1ª \+ 11x/);
 assert.match(src,/Anuidade = 1ª parcela \+ 12x/);
 assert.match(src,/Anuidade = 1ª parcela \+ 11x/);
 assert.match(src,/prodTuitionPlanCalc/);
 assert.match(src,/modo:"valor",valor:row\.value/);
});
