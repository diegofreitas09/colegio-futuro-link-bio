
/**
 * Gestão Futuro — API única da PWA
 * Este arquivo deve substituir o conteúdo atual de ApiPwa.gs no MESMO projeto Apps Script.
 * O Código.gs existente permanece como base de Secretaria/Financeiro.
 */
const PWA_API_VERSION="2026.09.20.4";
const PWA_CAPABILITIES=Object.freeze({testMode:true,clearTest:true,modeTagging:true,modeFilteredFinance:true,modeIsolationGuard:true,cashSaveIdempotency:true,cashDeleteIndividual:true,studentMigration:true,studentProgression:true,documentAdd:true});
const PWA_GATEWAY_PROP="FUTURO_PWA_GATEWAY_KEY";
const PWA_STAFF_HASH_PROP="FUTURO_STAFF_PASSWORD_SHA256";
const PWA_DEBUG_PROP="FUTURO_PWA_DEBUG";
const PWA_SESSION_TTL=21600;

const GF_TABS=Object.freeze({
  ANOS:"ANOS_LETIVOS",
  ATENDIMENTOS:"ATENDIMENTOS",
  ITENS_ATENDIMENTO:"ATENDIMENTO_ITENS",
  SOLICITACOES:"SOLICITACOES_DESCONTO",
  PANFLETOS:"PANFLETOS_SERIE",
  REAJUSTES:"HISTORICO_REAJUSTES",
  IMPORTACOES:"IMPORTACOES_ALUNOS"
});

function pwaJson_(obj){return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON)}
function pwaParseBody_(e){
  var raw=e&&e.postData&&e.postData.contents?String(e.postData.contents):"";
  if(!raw)return Object.assign({},e&&e.parameter||{});
  try{return JSON.parse(raw)}catch(err){
    var p=e&&e.parameter||{};
    if(p.payload){try{return JSON.parse(String(p.payload))}catch(_e){}}
    throw new Error("Corpo da requisição inválido.");
  }
}
function pwaSafeEqual_(a,b){a=String(a||"");b=String(b||"");if(a.length!==b.length)return false;var d=0;for(var i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0}
function pwaGatewayKey_(){return PropertiesService.getScriptProperties().getProperty(PWA_GATEWAY_PROP)||""}
function gerarGatewayPwa_(){
  var p=PropertiesService.getScriptProperties(),key=p.getProperty(PWA_GATEWAY_PROP);
  if(!key){key=sha256_(Utilities.getUuid()+Utilities.getUuid()+String(Date.now())+Utilities.getUuid());p.setProperty(PWA_GATEWAY_PROP,key)}
  console.log("Gateway da PWA configurado com sucesso.");return key;
}
function gerarGatewayPwa(){return gerarGatewayPwa_()}
function rotacionarGatewayPwa(){
  var key=sha256_(Utilities.getUuid()+Utilities.getUuid()+String(Date.now())+Utilities.getUuid());
  PropertiesService.getScriptProperties().setProperty(PWA_GATEWAY_PROP,key);
  console.log("NOVA_CHAVE_GERADA_COM_SUCESSO");return key;
}
function pwaRequireGateway_(key){var exp=pwaGatewayKey_();if(!exp)throw new Error("Gateway da PWA ainda não foi configurado.");if(!pwaSafeEqual_(key,exp))throw new Error("Gateway não autorizado.")}
function pwaNewSession_(role){var token=Utilities.getUuid()+Utilities.getUuid();CacheService.getScriptCache().put("gf:"+token,role,PWA_SESSION_TTL);return {ok:true,token:token,role:role,expiresIn:PWA_SESSION_TTL}}
function pwaCheckLoginLimit_(role){
  var cache=CacheService.getScriptCache(),key="gf_login_fail_"+role,n=Number(cache.get(key)||0);
  if(n>=10)throw new Error("Muitas tentativas de acesso. Aguarde 5 minutos.");
}
function pwaRecordLogin_(role,ok){
  var cache=CacheService.getScriptCache(),key="gf_login_fail_"+role;
  if(ok){cache.remove(key);return}
  var n=Number(cache.get(key)||0)+1;cache.put(key,String(n),300);
}
function loginSecretaria(password){
  pwaCheckLoginLimit_("secretaria");
  var props=PropertiesService.getScriptProperties(),expected=props.getProperty(PWA_STAFF_HASH_PROP)||(typeof ADMIN_PASSWORD_SHA256!=="undefined"?ADMIN_PASSWORD_SHA256:"");
  if(!expected)throw new Error("Senha da Secretaria ainda não foi configurada.");
  if(!pwaSafeEqual_(sha256_(password),expected)){audit_("Secretaria","LOGIN_NEGADO","Sessão","","","");pwaRecordLogin_("secretaria",false);return {ok:false,message:"Senha inválida."}}
  pwaRecordLogin_("secretaria",true);var s=pwaNewSession_("secretaria");audit_("Secretaria","LOGIN_OK","Sessão","","","");return s;
}
function pwaRole_(token){
  if(!token)throw new Error("Sessão ausente.");
  var role=CacheService.getScriptCache().get("gf:"+token);
  if(role!=="secretaria"&&role!=="admin")throw new Error("Sessão expirada ou inválida.");
  return role;
}
function pwaStaff_(token){
  try{return pwaRole_(token)}
  catch(staffErr){
    try{admin_(token);return "admin"}
    catch(adminErr){throw staffErr}
  }
}
function pwaAdmin_(token){admin_(token);return "admin"}
function pwaWithLock_(fn){var lock=LockService.getScriptLock();lock.waitLock(30000);try{return fn()}finally{lock.releaseLock()}}
function pwaOperationCache_(scope,key,value){key=String(key||"").trim();if(!key)return null;var cache=CacheService.getScriptCache(),k="gf_op_"+pwaSlug_(scope)+"_"+sha256_(key).slice(0,20);if(arguments.length>2){cache.put(k,JSON.stringify(value||{}),21600);return value}var raw=cache.get(k);if(!raw)return null;try{return JSON.parse(raw)}catch(e){return null}}
function pwaUser_(fallback){return Session.getActiveUser().getEmail()||fallback||"PWA"}
function pwaNum_(v){var n=Number(String(v==null?"":v).replace(",","."));return Number.isFinite(n)?n:0}
function gfRoundMoneyPwa_(v){return Math.round((Number(v||0)+Number.EPSILON)*100)/100}
function pwaMoneyChecked_(v,label){
  if(v===null||v===undefined||v==="")return 0;
  var s=String(v).trim().replace(/\s/g,"");
  if(s.indexOf(",")>=0){if(s.indexOf(".")>=0)s=s.replace(/\./g,"");s=s.replace(",",".")}
  var n=Number(s);if(!Number.isFinite(n)||n<0)throw new Error((label||"Valor")+" inválido.");
  return gfRoundMoneyPwa_(n);
}
function pwaSlug_(v){return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-Z0-9]+/g,"-").replace(/^-+|-+$/g,"")}
function pwaNorm_(v){return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()}
function pwaMode_(mode){return String(mode||"PRODUCAO").toUpperCase()==="TESTE"?"TESTE":"PRODUCAO"}
function pwaModeMatches_(row,mode){var r=String(row&&row.MODO_REGISTRO||"").toUpperCase();return pwaMode_(mode)==="TESTE"?r==="TESTE":r!=="TESTE"}
function pwaFilterMode_(arr,mode){return (arr||[]).filter(function(x){return pwaModeMatches_(x,mode)})}
function pwaAssertRowMode_(row,mode,label){
  if(row&&!pwaModeMatches_(row,mode))throw new Error((label||"Registro")+" pertence a outro ambiente. Produção e Teste não podem ser misturados.");
  return row;
}
function pwaRequireProduction_(mode,label){
  if(pwaMode_(mode)==="TESTE")throw new Error((label||"Este comando")+" altera configurações oficiais e não pode ser executado em Teste/Simulação.");
}
function pwaMarkLastDataRow_(sheetName,mode,sessao){
  var sh=SpreadsheetApp.getActive().getSheetByName(sheetName);if(!sh||sh.getLastRow()<5)return 0;
  var headers=sh.getRange(4,1,1,sh.getLastColumn()).getDisplayValues()[0],modeCol=headers.indexOf("MODO_REGISTRO")+1,sessCol=headers.indexOf("SESSAO_TESTE")+1;
  if(!modeCol)return 0;
  var row=sh.getLastRow();sh.getRange(row,modeCol).setValue(pwaMode_(mode));if(sessCol)sh.getRange(row,sessCol).setValue(pwaMode_(mode)==="TESTE"?String(sessao||""):"");return 1;
}
function pwaMoneyBr_(v){return "R$ "+Utilities.formatString("%.2f",gfRoundMoneyPwa_(v)).replace(".",",")}
function pwaDate_(v){
  if(v instanceof Date&&!isNaN(v.getTime()))return v;
  var s=String(v||"").trim(),m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);if(m)return new Date(Number(m[3]),Number(m[2])-1,Number(m[1]));
  var d=new Date(s);return isNaN(d.getTime())?null:d;
}
function pwaMarkWhere_(sheetName,matchKeys,matchValue,mode,sessao){
  if(!matchValue)return 0;
  var sh=SpreadsheetApp.getActive().getSheetByName(sheetName);if(!sh)return 0;
  var lastCol=sh.getLastColumn(),lastRow=sh.getLastRow();if(lastRow<5)return 0;
  var headers=sh.getRange(4,1,1,lastCol).getDisplayValues()[0];
  var modeCol=headers.indexOf("MODO_REGISTRO")+1,sessCol=headers.indexOf("SESSAO_TESTE")+1;if(!modeCol)return 0;
  var matchCol=0;
  (Array.isArray(matchKeys)?matchKeys:[matchKeys]).some(function(k){var i=headers.indexOf(k);if(i>=0){matchCol=i+1;return true}return false});
  if(!matchCol)return 0;
  var vals=sh.getRange(5,matchCol,lastRow-4,1).getDisplayValues(),count=0;
  vals.forEach(function(row,i){if(String(row[0])===String(matchValue)){sh.getRange(i+5,modeCol).setValue(pwaMode_(mode));if(sessCol)sh.getRange(i+5,sessCol).setValue(pwaMode_(mode)==="TESTE"?String(sessao||""):"");count++}});
  return count;
}
function pwaDeleteTestRows_(sheetName){
  var sh=SpreadsheetApp.getActive().getSheetByName(sheetName);if(!sh)return 0;
  var lastCol=sh.getLastColumn(),lastRow=sh.getLastRow();if(lastRow<5)return 0;
  var headers=sh.getRange(4,1,1,lastCol).getDisplayValues()[0],modeCol=headers.indexOf("MODO_REGISTRO")+1;if(!modeCol)return 0;
  var vals=sh.getRange(5,modeCol,lastRow-4,1).getDisplayValues(),rows=[];
  vals.forEach(function(r,i){if(String(r[0]||"").toUpperCase()==="TESTE")rows.push(i+5)});
  for(var i=rows.length-1;i>=0;i--)sh.deleteRow(rows[i]);
  return rows.length;
}
function limparAutorizacoesTestePwa_(token){
  pwaAdmin_(token);
  var removidas=0,atualizados=0;
  pwaWithLock_(function(){
    removidas=pwaDeleteTestRows_(GF_TABS.SOLICITACOES);
    var sh=SpreadsheetApp.getActive().getSheetByName(GF_TABS.ATENDIMENTOS);
    if(sh&&sh.getLastRow()>=5){
      var lastCol=sh.getLastColumn(),headers=sh.getRange(4,1,1,lastCol).getDisplayValues()[0];
      var modeCol=headers.indexOf("MODO_REGISTRO")+1,pendingCol=headers.indexOf("PEDIDO_DESCONTO_PENDENTE")+1;
      if(modeCol&&pendingCol){
        var vals=sh.getRange(5,1,sh.getLastRow()-4,lastCol).getDisplayValues();
        vals.forEach(function(row,idx){
          if(String(row[modeCol-1]||"").toUpperCase()==="TESTE"){
            sh.getRange(idx+5,pendingCol).setValue("Não");atualizados++;
          }
        });
      }
    }
    SpreadsheetApp.flush();
  });
  audit_("Gestão","LIMPAR_AUTORIZACOES_TESTE","Solicitações","TESTES","",JSON.stringify({removidas:removidas,atendimentosAtualizados:atualizados}));
  return {ok:true,removidas:removidas,atendimentosAtualizados:atualizados};
}
function limparDadosTestePwa_(token){
  pwaAdmin_(token);
  var tabs=["SOLICITACOES_DESCONTO","ATENDIMENTO_ITENS","ATENDIMENTOS","ITENS_CONTRATO","DOCUMENTOS_ALUNO","RECEBIMENTOS","CAIXA","MATRICULAS","RESPONSAVEIS","ALUNOS"];
  var out={},total=0;
  pwaWithLock_(function(){tabs.forEach(function(t){var n=pwaDeleteTestRows_(t);out[t]=n;total+=n});SpreadsheetApp.flush()});
  audit_("Gestão","LIMPAR_TESTES","Sistema","TESTES","",JSON.stringify(out));
  return {ok:true,total:total,porTabela:out};
}
function pwaDashboardPublico_(mode){
  var alunos=pwaFilterMode_(rows_(S.ALUNOS||"ALUNOS"),mode),mats=pwaFilterMode_(rows_(S.MATRICULAS||"MATRICULAS"),mode),docs=pwaFilterMode_(rows_("DOCUMENTOS_ALUNO"),mode);
  return {"Alunos ativos":alunos.filter(function(x){return x.STATUS!=="Inativo"}).length,"Matrículas ativas":mats.filter(function(x){return x.STATUS==="Ativa"||x.STATUS==="Ativo"}).length,"Documentos pendentes":docs.filter(function(x){return x.STATUS!=="Entregue"}).length};
}
function pwaDashboardGestao_(token,mode){
  pwaAdmin_(token);
  var recs=pwaFilterMode_(rows_(S.RECEBIMENTOS||"RECEBIMENTOS"),mode),cx=pwaFilterMode_(rows_(S.CAIXA||"CAIXA"),mode),ats=pwaFilterMode_(rows_(GF_TABS.ATENDIMENTOS),mode),mats=pwaFilterMode_(rows_(S.MATRICULAS||"MATRICULAS"),mode);
  var previsto=recs.reduce(function(s,x){return s+pwaNum_(x.VALOR_PREVISTO)},0),recebido=recs.reduce(function(s,x){return s+pwaNum_(x.VALOR_RECEBIDO)},0);
  var entradas=cx.filter(function(x){return x.TIPO==="Entrada"}).reduce(function(s,x){return s+pwaNum_(x.VALOR)},0),saidas=cx.filter(function(x){return x.TIPO==="Saída"}).reduce(function(s,x){return s+pwaNum_(x.VALOR)},0);
  return {"Receita prevista":gfRoundMoneyPwa_(previsto),"Receita recebida":gfRoundMoneyPwa_(recebido),"Saldo a receber":gfRoundMoneyPwa_(previsto-recebido),"Entradas de caixa":gfRoundMoneyPwa_(entradas),"Saídas de caixa":gfRoundMoneyPwa_(saidas),"Saldo de caixa":gfRoundMoneyPwa_(entradas-saidas),"Atendimentos em andamento":ats.filter(function(x){return x.STATUS==="Em andamento"}).length,"Matrículas ativas":mats.filter(function(x){return x.STATUS==="Ativa"||x.STATUS==="Ativo"}).length};
}
function pwaSpecificSeries_(p){
  var t=pwaNorm_(String(p.PRODUTO||"")+" "+String(p["DESCRIÇÃO"]||"")),m=t.match(/infantil\s*([2-5])\b/);
  if(m)return "infantil "+m[1];
  if(!/\b[1-9]\s*(?:º|o)?\s*(?:ao|a)\s*[1-9]/.test(t)){
    m=t.match(/\b([1-9])\s*(?:º|o)?\s*ano\b/);if(m)return m[1]+" ano";
    m=t.match(/\b([1-3])\s*(?:º|o)?\s*(?:em|ensino medio)\b/);if(m)return m[1]+" em";
  }
  return "";
}
function pwaTargetSeriesKey_(serie){
  var s=pwaNorm_(serie),m=s.match(/infantil\s*([2-5])\b/);if(m)return "infantil "+m[1];
  m=s.match(/\b([1-9])\s*(?:º|o)?\s*ano\b/);if(m)return m[1]+" ano";
  m=s.match(/\b([1-3])\s*(?:º|o)?\s*em\b/);if(m)return m[1]+" em";
  return s;
}
function pwaProductApplies_(p,serie){
  var s=pwaNorm_(serie),a=pwaNorm_(p["SEGMENTO_SÉRIE"]||""),specific=pwaSpecificSeries_(p),target=pwaTargetSeriesKey_(serie);
  if(specific)return specific===target;
  if(!s||!a||a.indexOf("todos")>=0)return true;
  if(s.indexOf("infantil")>=0)return a.indexOf("infantil")>=0;
  var m=s.match(/\d+/),n=m?Number(m[0]):0;
  if(s.indexOf("ano")>=0&&n>=1&&n<=5)return a.indexOf("1º ao 5º")>=0||a.indexOf("1o ao 5o")>=0||a.indexOf("anos iniciais")>=0||a.indexOf(s)>=0;
  if(s.indexOf("ano")>=0&&n>=6&&n<=9)return a.indexOf("6º ao 9º")>=0||a.indexOf("6o ao 9o")>=0||a.indexOf("anos finais")>=0||a.indexOf(s)>=0;
  if(s.indexOf("em")>=0)return a.indexOf("medio")>=0||a.indexOf("ensino medio")>=0||a.indexOf(s)>=0;
  return a.indexOf(s)>=0;
}
function pwaPublished_(p){var v=pwaNorm_(p.PUBLICADO_ATENDIMENTO);return v!=="nao"&&v!=="não"}
function pwaCatalogo_(ano,serie){
  return rows_(S.PRODUTOS).filter(function(p){return p.ATIVO==="Sim"&&Number(p.ANO_LETIVO)===Number(ano)&&pwaPublished_(p)&&pwaProductApplies_(p,serie)});
}
function pwaBootstrapSecretaria_(token,modo){
  pwaStaff_(token);var b=bootstrap(),keys=["alunos","matriculas","responsaveis","documentos","recebimentos","caixa"];
  keys.forEach(function(k){if(Array.isArray(b[k]))b[k]=pwaFilterMode_(b[k],modo)});
  try{b.itensContrato=pwaFilterMode_(rows_("ITENS_CONTRATO"),modo)}catch(e){b.itensContrato=[]}
  return b
}
function pwaAtualizarDocumento_(token,id,patch,modo,sessao){
  pwaStaff_(token);return pwaWithLock_(function(){
    var row=findById_("DOCUMENTOS_ALUNO","ID_DOCUMENTO",id);if(!row)throw new Error("Documento não encontrado.");pwaAssertRowMode_(row,modo,"Documento");
    var p=Object.assign({},patch||{},{MODO_REGISTRO:pwaMode_(modo),SESSAO_TESTE:pwaMode_(modo)==="TESTE"?String(sessao||""):""});
    return atualizarDocumento(id,p);
  })
}
function pwaListarDocumentosAluno_(token,idAluno,modo){pwaStaff_(token);return pwaFilterMode_(listarDocumentosAluno(idAluno)||[],modo)}
function pwaAdicionarDocumentoAluno_(token,data,modo,sessao){
  pwaStaff_(token);data=data||{};
  if(!data.ID_ALUNO)throw new Error("Aluno não informado.");
  if(!data.DOCUMENTO)throw new Error("Informe o nome do documento.");
  return pwaWithLock_(function(){
    var aluno=findById_("ALUNOS","ID_ALUNO",data.ID_ALUNO);
    if(!aluno)throw new Error("Aluno não encontrado.");
    pwaAssertRowMode_(aluno,modo,"Aluno");
    var id=nextId_("DOC-","DOCUMENTOS_ALUNO","ID_DOCUMENTO"),now=new Date();
    append_("DOCUMENTOS_ALUNO",{
      ID_DOCUMENTO:id,
      ID_ALUNO:data.ID_ALUNO,
      ID_MATRICULA:data.ID_MATRICULA||"",
      ID_REGRA:data.ID_REGRA||"",
      DOCUMENTO:data.DOCUMENTO||"",
      STATUS:data.STATUS||"Pendente",
      DATA_ENTREGA:data.DATA_ENTREGA||"",
      DATA_VALIDADE:data.DATA_VALIDADE||"",
      LINK_DRIVE:data.LINK_DRIVE||"",
      OBSERVACAO:data.OBSERVACAO||"",
      CONFERIDO_POR:data.CONFERIDO_POR||"",
      CONFERIDO_EM:data.CONFERIDO_EM||"",
      OBRIGATORIO:data.OBRIGATORIO||"A conferir",
      PENDENCIA:data.PENDENCIA||"",
      MODO_REGISTRO:pwaMode_(modo),
      SESSAO_TESTE:pwaMode_(modo)==="TESTE"?String(sessao||""):""
    });
    audit_("Secretaria","ADICIONAR_DOCUMENTO","Aluno",data.ID_ALUNO,"",JSON.stringify({id:id,documento:data.DOCUMENTO}));
    SpreadsheetApp.flush();
    return {ok:true,id:id};
  })
}
function pwaListarRecebimentosAluno_(token,idAluno,modo){pwaStaff_(token);return pwaFilterMode_(listarRecebimentosAluno(idAluno)||[],modo)}
function pwaListarRecebimentos_(token,modo){pwaAdmin_(token);return pwaFilterMode_(listarRecebimentos(token)||[],modo)}
function pwaListarCaixa_(token,modo){pwaAdmin_(token);return pwaFilterMode_(listarCaixa(token)||[],modo)}
function pwaRegistrarPagamento_(token,data,modo,sessao){
  pwaAdmin_(token);data=data||{};return pwaWithLock_(function(){
    var rec=findById_("RECEBIMENTOS","ID_RECEBIMENTO",data.ID_RECEBIMENTO);if(!rec)throw new Error("Recebimento não encontrado.");pwaAssertRowMode_(rec,modo,"Recebimento");
    var res=registrarPagamento(token,data);
    pwaMarkWhere_("RECEBIMENTOS","ID_RECEBIMENTO",data.ID_RECEBIMENTO,modo,sessao);
    pwaMarkWhere_("CAIXA","ID_RECEBIMENTO",data.ID_RECEBIMENTO,modo,sessao);
    return res;
  })
}
function pwaSalvarMovimentoCaixa_(token,data,modo,sessao){
  pwaAdmin_(token);data=data||{};return pwaWithLock_(function(){
    var requestId=String(data.CLIENT_REQUEST_ID||"").trim(),cache=CacheService.getScriptCache(),cacheKey=requestId?("gf_cash_save_"+requestId):"";
    if(cacheKey){
      var prior=cache.get(cacheKey);
      if(prior){try{return JSON.parse(prior)}catch(_e){return {ok:true,duplicate:true}}}
    }
    var payload=Object.assign({},data);delete payload.CLIENT_REQUEST_ID;
    payload.MODO_REGISTRO=pwaMode_(modo);payload.SESSAO_TESTE=pwaMode_(modo)==="TESTE"?String(sessao||""):"";
    var res=salvarMovimentoCaixa(token,payload),id=res&&(res.id||res.ID_CAIXA)||payload.ID_CAIXA||"";
    if(id)pwaMarkWhere_("CAIXA","ID_CAIXA",id,modo,sessao);else pwaMarkLastDataRow_("CAIXA",modo,sessao);
    var out=res&&typeof res==="object"?res:{ok:true,id:id};out.id=out.id||id||"";out.duplicate=false;
    if(cacheKey)cache.put(cacheKey,JSON.stringify(out),600);
    return out;
  })
}
function pwaExcluirMovimentoCaixa_(token,id,modo){
  pwaAdmin_(token);id=String(id||"").trim();if(!id)throw new Error("Movimentação não informada.");
  return pwaWithLock_(function(){
    var rec=findById_("CAIXA","ID_CAIXA",id);if(!rec)throw new Error("Movimentação não encontrada.");
    pwaAssertRowMode_(rec,modo,"Movimentação");
    if(String(rec.ID_RECEBIMENTO||"").trim())throw new Error("Esta movimentação está vinculada a um recebimento. Faça o estorno pelo módulo Recebimentos para manter o financeiro consistente.");
    var sh=SpreadsheetApp.getActive().getSheetByName("CAIXA");if(!sh)throw new Error("Aba CAIXA não encontrada.");
    var lastCol=sh.getLastColumn(),lastRow=sh.getLastRow(),headers=sh.getRange(4,1,1,lastCol).getDisplayValues()[0],idCol=headers.indexOf("ID_CAIXA")+1;
    if(!idCol)throw new Error("Coluna ID_CAIXA não encontrada.");
    var ids=lastRow>=5?sh.getRange(5,idCol,lastRow-4,1).getDisplayValues():[],rowNum=0;
    for(var i=0;i<ids.length;i++){if(String(ids[i][0]).trim()===id){rowNum=i+5;break}}
    if(!rowNum)throw new Error("Movimentação não localizada na planilha.");
    audit_("Gestão","EXCLUIR","Caixa",id,JSON.stringify(rec),"");
    sh.deleteRow(rowNum);SpreadsheetApp.flush();
    return {ok:true,id:id};
  })
}
function pwaGetFechamento_(token,modo){
  pwaAdmin_(token);if(pwaMode_(modo)!=="TESTE")return getFechamento(token);
  var now=new Date(),start=new Date(now.getFullYear(),now.getMonth(),1),end=new Date(now.getFullYear(),now.getMonth()+1,0);
  var rows=pwaFilterMode_(rows_("CAIXA"),"TESTE").filter(function(x){var d=pwaDate_(x.DATA);return d&&d>=start&&d<=new Date(end.getFullYear(),end.getMonth(),end.getDate(),23,59,59)});
  var entradas=rows.filter(function(x){return String(x.TIPO)==="Entrada"}).reduce(function(s,x){return s+pwaNum_(x.VALOR)},0);
  var saidas=rows.filter(function(x){return String(x.TIPO)==="Saída"}).reduce(function(s,x){return s+pwaNum_(x.VALOR)},0);
  function byForma(re){return rows.filter(function(x){return String(x.TIPO)==="Entrada"&&re.test(pwaNorm_(x.FORMA_PAGAMENTO))}).reduce(function(s,x){return s+pwaNum_(x.VALOR)},0)}
  return {headers:["PERÍODO","DATA_INICIAL","DATA_FINAL","ENTRADAS","SAÍDAS","SALDO","PIX","DINHEIRO","CARTÕES","BOLETO/TRANSF.","STATUS"],atual:[
    "Mês atual",Utilities.formatDate(start,Session.getScriptTimeZone(),"dd/MM/yyyy"),Utilities.formatDate(end,Session.getScriptTimeZone(),"dd/MM/yyyy"),
    pwaMoneyBr_(entradas),pwaMoneyBr_(saidas),pwaMoneyBr_(entradas-saidas),pwaMoneyBr_(byForma(/pix/)),pwaMoneyBr_(byForma(/dinheiro/)),
    pwaMoneyBr_(byForma(/cart/)),pwaMoneyBr_(byForma(/boleto|transf/)),"Simulação"
  ]};
}
function pwaSalvarAluno_(token,data,modo,sessao){
  pwaStaff_(token);data=data||{};data.MODO_REGISTRO=pwaMode_(modo);data.SESSAO_TESTE=pwaMode_(modo)==="TESTE"?String(sessao||""):"";
  return pwaWithLock_(function(){
    if(data.ID_ALUNO)pwaAssertRowMode_(findById_("ALUNOS","ID_ALUNO",data.ID_ALUNO),modo,"Aluno");
    var res=salvarAluno(data),id=res&&(res.id||res.ID_ALUNO)||data.ID_ALUNO||"";if(id)pwaMarkWhere_("ALUNOS","ID_ALUNO",id,modo,sessao);return res
  })
}
function pwaSalvarResponsavel_(token,data,modo,sessao){
  pwaStaff_(token);data=data||{};data.MODO_REGISTRO=pwaMode_(modo);data.SESSAO_TESTE=pwaMode_(modo)==="TESTE"?String(sessao||""):"";
  return pwaWithLock_(function(){
    if(data.ID_RESPONSAVEL)pwaAssertRowMode_(findById_("RESPONSAVEIS","ID_RESPONSAVEL",data.ID_RESPONSAVEL),modo,"Responsável");
    var res=salvarResponsavel(data),id=res&&(res.id||res.ID_RESPONSAVEL)||data.ID_RESPONSAVEL||"";if(id)pwaMarkWhere_("RESPONSAVEIS","ID_RESPONSAVEL",id,modo,sessao);return res
  })
}
function pwaCriarMatricula_(token,data,modo,sessao){
  pwaStaff_(token);data=data||{};data.MODO_REGISTRO=pwaMode_(modo);data.SESSAO_TESTE=pwaMode_(modo)==="TESTE"?String(sessao||""):"";
  return pwaWithLock_(function(){
    var prior=pwaOperationCache_("matricula",data.CLIENT_REQUEST_ID);if(prior)return prior;
    var res=criarMatriculaCompleta(data||{}),id=res&& (res.id||res["ID_MATRÍCULA"]||res.ID_MATRICULA)||"",services=[];
    if(id){
      pwaMarkWhere_("MATRICULAS",["ID_MATRÍCULA","ID_MATRICULA"],id,modo,sessao);
      pwaMarkWhere_("DOCUMENTOS_ALUNO",["ID_MATRICULA","ID_MATRÍCULA"],id,modo,sessao);
      pwaMarkWhere_("RECEBIMENTOS",["ID_MATRÍCULA","ID_MATRICULA"],id,modo,sessao);
      pwaMarkWhere_("ITENS_CONTRATO",["ID_MATRÍCULA","ID_MATRICULA"],id,modo,sessao);
    }
    try{services=JSON.parse(String(data.SERVICOS_ADICIONAIS||"[]"))}catch(e){services=[]}
    if(id&&Array.isArray(services)&&services.length){
      services.forEach(function(s){
        var p=findById_(S.PRODUTOS,"ID_PRODUTO",s.ID_PRODUTO);if(!p)throw new Error("Produto/serviço adicional não encontrado.");var iid=nextId_("ITC-","ITENS_CONTRATO","ID_ITEM"),qtd=1,unit=pwaMoneyChecked_(p.VALOR_BASE,"Valor do produto/serviço");
        append_("ITENS_CONTRATO",{
          ID_ITEM:iid,
          "ID_MATRÍCULA":id,
          ID_PRODUTO:s.ID_PRODUTO||"",
          PRODUTO:s.PRODUTO||p.PRODUTO||"",
          QTD:qtd,
          VALOR_UNIT_TABELA:unit,
          "DESCONTO_%":0,
          VALOR_UNIT_CONTRATADO:unit,
          "TOTAL_LÍQUIDO":unit*qtd,
          FORMA_PAGAMENTO:p.TIPO_COBRANCA||"Conforme produto",
          PARCELAS:Number(p.QTD_PARCELAS||1),
          "DATA_INÍCIO":new Date(),
          STATUS:"Ativo",
          "OBSERVAÇÃO":"Adicionado pela Gestão Futuro • "+String(p["DESCRIÇÃO"]||p["OBSERVAÇÃO"]||""),
          MODO_REGISTRO:pwaMode_(modo),SESSAO_TESTE:pwaMode_(modo)==="TESTE"?String(sessao||""):""
        });
      });
      audit_("Secretaria","ADICIONAR_SERVICOS_MATRICULA","Matrícula",id,"",JSON.stringify(services));
      SpreadsheetApp.flush();
    }
    if(res&&typeof res==="object")res.servicos=services.length;
    pwaOperationCache_("matricula",data.CLIENT_REQUEST_ID,res);return res;
  })
}

function listarAtendimentosPwa_(token,modo){pwaStaff_(token);return pwaFilterMode_(rows_(GF_TABS.ATENDIMENTOS),modo)}
function getAtendimentoPwa_(token,id,modo){
  pwaStaff_(token);
  var atendimento=findById_(GF_TABS.ATENDIMENTOS,"ID_ATENDIMENTO",id);
  if(!atendimento)throw new Error("Atendimento não encontrado.");pwaAssertRowMode_(atendimento,modo,"Atendimento");
  var itens=pwaFilterMode_(rows_(GF_TABS.ITENS_ATENDIMENTO),modo).filter(function(x){return x.ID_ATENDIMENTO===id&&x.SELECIONADO!=="Não"});
  return {atendimento:atendimento,itens:itens};
}
function salvarAtendimentoPwa_(token,data,itens,modo,sessao){
  pwaStaff_(token);data=data||{};itens=Array.isArray(itens)?itens:[];
  if(!data.NOME_ALUNO||!data.ANO_LETIVO||!data.SERIE_PRETENDIDA)throw new Error("Aluno, ano letivo e série são obrigatórios.");
  return pwaWithLock_(function(){
    var id=String(data.ID_ATENDIMENTO||"").trim(),old=id?findById_(GF_TABS.ATENDIMENTOS,"ID_ATENDIMENTO",id):null,now=new Date();
    if(old)pwaAssertRowMode_(old,modo,"Atendimento");
    var extrasTotal=itens.filter(function(x){return x.CATEGORIA!=="Mensalidade"}).reduce(function(s,x){return s+pwaNum_(x.VALOR_APRESENTADO||x.VALOR_TABELA)*Math.max(1,pwaNum_(x.QTD)||1)},0);
    var planTotal=pwaNum_(data.TOTAL_PLANO),total=planTotal>0?planTotal+extrasTotal:itens.reduce(function(s,x){return s+pwaNum_(x.VALOR_APRESENTADO||x.VALOR_TABELA)*Math.max(1,pwaNum_(x.QTD)||1)},0);
    if(!id)id=nextId_("ATE-",GF_TABS.ATENDIMENTOS,"ID_ATENDIMENTO");
    var rec={
      ID_ATENDIMENTO:id,
      DATA_ABERTURA:old&&old.DATA_ABERTURA?old.DATA_ABERTURA:now,
      ID_ALUNO:data.ID_ALUNO||"",
      NOME_ALUNO:data.NOME_ALUNO||"",
      RESPONSAVEL:data.RESPONSAVEL||"",
      TELEFONE:data.TELEFONE||"",
      EMAIL:data.EMAIL||"",
      TIPO_ALUNO:data.TIPO_ALUNO||"Novato",
      ANO_LETIVO:Number(data.ANO_LETIVO),
      SERIE_PRETENDIDA:data.SERIE_PRETENDIDA||"",
      TURNO:data.TURNO||"",
      MODALIDADE:data.MODALIDADE||"Regular",
      ORIGEM:data.ORIGEM||"",
      ETAPA:data.ETAPA||"Contato",
      "PROGRESSO_%":Number(data.PROGRESSO||12),
      STATUS:data.STATUS||"Em andamento",
      VISITA_REALIZADA:data.ETAPA==="Visita"||["Proposta","Decisão","Matriculado"].indexOf(data.ETAPA)>=0?"Sim":"Não",
      PROPOSTA_APRESENTADA:["Proposta","Decisão","Matriculado"].indexOf(data.ETAPA)>=0?"Sim":"Não",
      FAMILIA_CONFIRMOU:["Decisão","Matriculado"].indexOf(data.ETAPA)>=0?"Sim":"Não",
      MATRICULADO:data.ETAPA==="Matriculado"?"Sim":"Não",
      MOTIVO_PERDA:data.MOTIVO_PERDA||"",
      OBSERVACAO:data.OBSERVACAO||"",
      PROXIMO_CONTATO:data.PROXIMO_CONTATO||"",
      ATENDENTE:pwaUser_("Atendimento"),
      TOTAL_PROPOSTA:gfRoundMoneyPwa_(total),
      PEDIDO_DESCONTO_PENDENTE:old&&old.PEDIDO_DESCONTO_PENDENTE||"Não",
      CRIADO_POR:old&&old.CRIADO_POR||pwaUser_("Atendimento"),
      CRIADO_EM:old&&old.CRIADO_EM||now,
      ATUALIZADO_POR:pwaUser_("Atendimento"),
      ATUALIZADO_EM:now,
      PLANO_PARCELAS:Number(data.PLANO_PARCELAS||0),
      VALOR_ANUIDADE:pwaNum_(data.VALOR_ANUIDADE),
      VALOR_PRIMEIRA_BASE:pwaNum_(data.VALOR_PRIMEIRA_BASE),
      "DESCONTO_PRIMEIRA_%":pwaNum_(data["DESCONTO_PRIMEIRA_%"]),
      VALOR_PRIMEIRA_FINAL:pwaNum_(data.VALOR_PRIMEIRA_FINAL),
      VALOR_PARCELA_BASE:pwaNum_(data.VALOR_PARCELA_BASE),
      "DESCONTO_PARCELAS_%":pwaNum_(data["DESCONTO_PARCELAS_%"]),
      VALOR_PARCELA_FINAL:pwaNum_(data.VALOR_PARCELA_FINAL),
      TOTAL_PLANO:planTotal,
      ECONOMIA_PLANO:pwaNum_(data.ECONOMIA_PLANO),
      MODO_REGISTRO:pwaMode_(modo),SESSAO_TESTE:pwaMode_(modo)==="TESTE"?String(sessao||""):""
    };
    if(old)updateById_(GF_TABS.ATENDIMENTOS,"ID_ATENDIMENTO",id,rec);else append_(GF_TABS.ATENDIMENTOS,rec);
    var existentes=pwaFilterMode_(rows_(GF_TABS.ITENS_ATENDIMENTO),modo).filter(function(x){return x.ID_ATENDIMENTO===id});
    existentes.forEach(function(x){updateById_(GF_TABS.ITENS_ATENDIMENTO,"ID_ITEM_ATENDIMENTO",x.ID_ITEM_ATENDIMENTO,{SELECIONADO:"Não",ATUALIZADO_EM:now})});
    itens.forEach(function(x){
      var ex=existentes.find(function(e){return e.ID_PRODUTO===x.ID_PRODUTO}),iid=ex&&ex.ID_ITEM_ATENDIMENTO||nextId_("ATI-",GF_TABS.ITENS_ATENDIMENTO,"ID_ITEM_ATENDIMENTO"),item={
        ID_ITEM_ATENDIMENTO:iid,ID_ATENDIMENTO:id,ID_PRODUTO:x.ID_PRODUTO||"",ANO_LETIVO:Number(data.ANO_LETIVO),PRODUTO:x.PRODUTO||"",CATEGORIA:x.CATEGORIA||"",SERIE:data.SERIE_PRETENDIDA||"",QTD:Number(x.QTD||1),VALOR_TABELA:pwaNum_(x.VALOR_TABELA),"DESCONTO_%":pwaNum_(x.DESCONTO),VALOR_APRESENTADO:pwaNum_(x.VALOR_APRESENTADO||x.VALOR_TABELA),OBRIGATORIO:x.OBRIGATORIO||"Não",SELECIONADO:"Sim",OBSERVACAO:x.OBSERVACAO||"",CRIADO_EM:ex&&ex.CRIADO_EM||now,ATUALIZADO_EM:now,MODO_REGISTRO:pwaMode_(modo),SESSAO_TESTE:pwaMode_(modo)==="TESTE"?String(sessao||""):""
      };
      if(ex)updateById_(GF_TABS.ITENS_ATENDIMENTO,"ID_ITEM_ATENDIMENTO",iid,item);else append_(GF_TABS.ITENS_ATENDIMENTO,item);
    });
    audit_("Atendimento",old?"EDITAR":"CRIAR","Atendimento",id,old?JSON.stringify(old):"",JSON.stringify(rec));
    SpreadsheetApp.flush();return {ok:true,id:id,total:rec.TOTAL_PROPOSTA};
  });
}

function solicitarDescontoPwa_(token,d,modo,sessao){
  pwaStaff_(token);d=d||{};
  if(!d.ID_ATENDIMENTO||!d.ID_PRODUTO)throw new Error("Atendimento e produto são obrigatórios.");
  return pwaWithLock_(function(){
    var at=findById_(GF_TABS.ATENDIMENTOS,"ID_ATENDIMENTO",d.ID_ATENDIMENTO);if(!at)throw new Error("Atendimento não encontrado.");pwaAssertRowMode_(at,modo,"Atendimento");
    var prod=findById_(S.PRODUTOS,"ID_PRODUTO",d.ID_PRODUTO);if(!prod)throw new Error("Produto não encontrado.");var existing=pwaFilterMode_(rows_(GF_TABS.SOLICITACOES),modo).find(function(x){return x.ID_ATENDIMENTO===d.ID_ATENDIMENTO&&x.ID_PRODUTO===d.ID_PRODUTO&&x.STATUS==="Aguardando"});if(existing)return {ok:true,id:existing.ID_SOLICITACAO,produto:prod.PRODUTO||"",duplicate:true};var official=pwaMoneyChecked_(prod.VALOR_BASE,"Valor oficial"),requested=pwaMoneyChecked_(d.VALOR_SOLICITADO,"Valor solicitado");if(requested>official)throw new Error("Valor solicitado acima do valor oficial.");var id=nextId_("SOL-",GF_TABS.SOLICITACOES,"ID_SOLICITACAO"),now=new Date();
    append_(GF_TABS.SOLICITACOES,{
      ID_SOLICITACAO:id,ID_ATENDIMENTO:d.ID_ATENDIMENTO,ID_ALUNO:at.ID_ALUNO||"",ID_PRODUTO:d.ID_PRODUTO,ANO_LETIVO:Number(d.ANO_LETIVO||at.ANO_LETIVO),SERIE:d.SERIE||at.SERIE_PRETENDIDA||"",VALOR_TABELA:official, "DESCONTO_SOLICITADO_%":official?gfRoundMoneyPwa_(((official-requested)/official)*100):0,VALOR_SOLICITADO:requested,MOTIVO:d.MOTIVO||"",STATUS:"Aguardando",VALOR_AUTORIZADO:"",OBSERVACAO_GESTAO:"",SOLICITADO_POR:pwaUser_("Atendimento"),SOLICITADO_EM:now,DECIDIDO_POR:"",DECIDIDO_EM:"",ALERTA_ENVIADO:"Não",CONCLUIDO_EM:"",OBSERVACAO_FINAL:"",MODO_REGISTRO:pwaMode_(modo),SESSAO_TESTE:pwaMode_(modo)==="TESTE"?String(sessao||""):""
    });
    updateById_(GF_TABS.ATENDIMENTOS,"ID_ATENDIMENTO",d.ID_ATENDIMENTO,{PEDIDO_DESCONTO_PENDENTE:"Sim",ATUALIZADO_EM:now});
    audit_("Atendimento","SOLICITAR_DESCONTO","Solicitação",id,"",JSON.stringify(d));SpreadsheetApp.flush();return {ok:true,id:id,produto:prod&&prod.PRODUTO||""};
  });
}
function listarSolicitacoesDescontoPwa_(token,modo){
  pwaAdmin_(token);var ats=pwaFilterMode_(rows_(GF_TABS.ATENDIMENTOS),modo),ps=rows_(S.PRODUTOS);
  return pwaFilterMode_(rows_(GF_TABS.SOLICITACOES),modo).map(function(r){var a=ats.find(function(x){return x.ID_ATENDIMENTO===r.ID_ATENDIMENTO}),p=ps.find(function(x){return x.ID_PRODUTO===r.ID_PRODUTO});r.ALUNO=a&&a.NOME_ALUNO||r.ID_ALUNO||"";r.PRODUTO=p&&p.PRODUTO||r.ID_PRODUTO||"";r.RESPONSAVEL=a&&a.RESPONSAVEL||"";return r}).reverse();
}
function decidirSolicitacaoDescontoPwa_(token,id,status,valor,obs,modo){
  pwaAdmin_(token);if(["Autorizado","Negado"].indexOf(status)<0)throw new Error("Decisão inválida.");
  return pwaWithLock_(function(){
    var r=findById_(GF_TABS.SOLICITACOES,"ID_SOLICITACAO",id);if(!r)throw new Error("Solicitação não encontrada.");pwaAssertRowMode_(r,modo,"Solicitação");
    var table=pwaMoneyChecked_(r.VALOR_TABELA,"Valor de tabela"),aut=status==="Autorizado"?pwaMoneyChecked_(valor,"Valor autorizado"):0;if(status==="Autorizado"&&aut>table)throw new Error("Valor autorizado acima do valor de tabela.");var now=new Date(),patch={STATUS:status,VALOR_AUTORIZADO:status==="Autorizado"?aut:"",OBSERVACAO_GESTAO:obs||"",DECIDIDO_POR:pwaUser_("Gestão"),DECIDIDO_EM:now};
    updateById_(GF_TABS.SOLICITACOES,"ID_SOLICITACAO",id,patch);
    if(status==="Autorizado"){
      var item=pwaFilterMode_(rows_(GF_TABS.ITENS_ATENDIMENTO),modo).find(function(x){return x.ID_ATENDIMENTO===r.ID_ATENDIMENTO&&x.ID_PRODUTO===r.ID_PRODUTO&&x.SELECIONADO==="Sim"});
      if(item){var desc=table?((table-aut)/table)*100:0;updateById_(GF_TABS.ITENS_ATENDIMENTO,"ID_ITEM_ATENDIMENTO",item.ID_ITEM_ATENDIMENTO,{"DESCONTO_%":desc,VALOR_APRESENTADO:aut,ATUALIZADO_EM:now})}
    }
    var pend=pwaFilterMode_(rows_(GF_TABS.SOLICITACOES),modo).filter(function(x){return x.ID_ATENDIMENTO===r.ID_ATENDIMENTO&&x.ID_SOLICITACAO!==id&&x.STATUS==="Aguardando"});
    updateById_(GF_TABS.ATENDIMENTOS,"ID_ATENDIMENTO",r.ID_ATENDIMENTO,{PEDIDO_DESCONTO_PENDENTE:pend.length?"Sim":"Não",ATUALIZADO_EM:now});
    audit_("Gestão",status==="Autorizado"?"AUTORIZAR_DESCONTO":"NEGAR_DESCONTO","Solicitação",id,JSON.stringify(r),JSON.stringify(patch));SpreadsheetApp.flush();return {ok:true,id:id};
  });
}

function getPanfletoSeriePwa_(token,ano,serie){
  pwaStaff_(token);var cfg=rows_(GF_TABS.PANFLETOS).find(function(x){return Number(x.ANO_LETIVO)===Number(ano)&&x.SERIE===serie&&x.ATIVO!=="Não"})||null;
  return {config:cfg,produtos:pwaCatalogo_(ano,serie)};
}
function salvarPanfletoSeriePwa_(token,ano,serie,data){
  pwaAdmin_(token);data=data||{};return pwaWithLock_(function(){
    var all=rows_(GF_TABS.PANFLETOS),old=all.find(function(x){return Number(x.ANO_LETIVO)===Number(ano)&&x.SERIE===serie}),id=old&&old.ID_PANFLETO||("PAN-"+ano+"-"+pwaSlug_(serie)),rec={
      ID_PANFLETO:id,ANO_LETIVO:Number(ano),SERIE:serie,TITULO:data.TITULO||("Colégio Futuro • "+serie),SUBTITULO:data.SUBTITULO||"",DESTAQUES:data.DESTAQUES||"",O_QUE_OFERECE:data.O_QUE_OFERECE||"",MATERIAL_DIDATICO:data.MATERIAL_DIDATICO||"",FARDAMENTO:data.FARDAMENTO||"",SERVICOS_ADICIONAIS:data.SERVICOS_ADICIONAIS||"",DOCUMENTOS_NOVATO:data.DOCUMENTOS_NOVATO||"",DOCUMENTOS_VETERANO:data.DOCUMENTOS_VETERANO||"",OBSERVACOES:data.OBSERVACOES||"",LOGO_URL:data.LOGO_URL||"",IMAGEM_URL:data.IMAGEM_URL||"",ATIVO:"Sim",ATUALIZADO_EM:new Date(),ATUALIZADO_POR:pwaUser_("Gestão")
    };
    if(old)updateById_(GF_TABS.PANFLETOS,"ID_PANFLETO",id,rec);else append_(GF_TABS.PANFLETOS,rec);audit_("Gestão","EDITAR_PANFLETO","Panfleto",id,old?JSON.stringify(old):"",JSON.stringify(rec));SpreadsheetApp.flush();return {ok:true,id:id};
  });
}


function pwaUniqueProductId_(prefix,name,year){
  var base=(prefix||"SRV")+"-"+pwaSlug_(name||"ITEM")+"-"+String(year||"");
  var all=rows_(S.PRODUTOS),id=base,n=2;
  while(all.some(function(x){return String(x.ID_PRODUTO)===id})){id=base+"-"+n;n++}
  return id;
}
function pwaCriarProdutoServico_(token,data){
  pwaAdmin_(token);data=data||{};
  if(!data.PRODUTO||!data.ANO_LETIVO||!data.CATEGORIA)throw new Error("Produto/serviço, categoria e ano letivo são obrigatórios.");
  return pwaWithLock_(function(){
    var year=Number(data.ANO_LETIVO),id=pwaUniqueProductId_(data.CATEGORIA==="Serviço"?"SRV":"PRD",data.PRODUTO,year),now=new Date();
    var rec={
      ID_PRODUTO:id,
      CATEGORIA:data.CATEGORIA||"Serviço",
      SUBCATEGORIA:data.SUBCATEGORIA||"",
      PRODUTO:data.PRODUTO||"",
      "SEGMENTO_SÉRIE":data["SEGMENTO_SÉRIE"]||data.SEGMENTO_SERIE||"Todos",
      "DESCRIÇÃO":data["DESCRIÇÃO"]||data.DESCRICAO||"",
      VALOR_BASE:pwaNum_(data.VALOR_BASE),
      "VALOR_PÓS_VENCIMENTO":pwaNum_(data["VALOR_PÓS_VENCIMENTO"]),
      "VALOR_CRÉDITO":pwaNum_(data["VALOR_CRÉDITO"]),
      QTD_PARCELAS:Number(data.QTD_PARCELAS||1),
      VALOR_PARCELA:pwaNum_(data.VALOR_PARCELA),
      VENCIMENTO_PADRÃO:data.VENCIMENTO_PADRÃO||"",
      ANO_LETIVO:year,
      ATIVO:data.ATIVO||"Sim",
      "OBSERVAÇÃO":data["OBSERVAÇÃO"]||data.OBSERVACAO||"",
      ORIGEM:"Gestão Futuro",
      TIPO_COBRANCA:data.TIPO_COBRANCA||"Única",
      DISPONIVEL_MATRICULA:data.DISPONIVEL_MATRICULA||"Sim",
      ORDEM_EXIBICAO:Number(data.ORDEM_EXIBICAO||100),
      OBSERVACAO_INTERNA:data.OBSERVACAO_INTERNA||"",
      VALOR_ORIGEM:"",
      ANO_ORIGEM:"",
      "REAJUSTE_%":"",
      PUBLICADO_ATENDIMENTO:data.PUBLICADO_ATENDIMENTO||"Sim",
      ATUALIZADO_EM:now,
      ATUALIZADO_POR:pwaUser_("Gestão")
    };
    append_(S.PRODUTOS,rec);
    audit_("Gestão","CRIAR","Produto/Serviço",id,"",JSON.stringify(rec));
    SpreadsheetApp.flush();
    return {ok:true,id:id,produto:rec.PRODUTO,ano:year};
  });
}
function aplicarReajusteIndividualPwa_(token,d){
  pwaAdmin_(token);d=d||{};
  var origem=Number(d.anoOrigem),destino=Number(d.anoDestino),id=String(d.idProduto||""),modo=String(d.modo||"percentual"),v=pwaNum_(d.valor),pub=String(d.publicar||"Sim");
  if(!id||!origem||!destino||origem===destino)throw new Error("Informe produto, ano de origem e ano de destino.");
  return pwaWithLock_(function(){
    var p=findById_(S.PRODUTOS,"ID_PRODUTO",id);if(!p)throw new Error("Produto/serviço de origem não encontrado.");
    if(Number(p.ANO_LETIVO)!==origem)throw new Error("O produto selecionado não pertence ao ano de origem.");
    var current=pwaNum_(p.VALOR_BASE),newValue=modo==="valor"?v:gfRoundMoneyPwa_(current*(1+v/100));
    var pct=current?gfRoundMoneyPwa_(((newValue/current)-1)*100):0,now=new Date();
    var destId=String(id).indexOf(String(origem))>=0?String(id).replace(String(origem),String(destino)):String(id)+"-"+destino;
    var all=rows_(S.PRODUTOS),old=all.find(function(x){return x.ID_PRODUTO===destId||Number(x.ANO_LETIVO)===destino&&x.PRODUTO===String(p.PRODUTO||"").replace(String(origem),String(destino))&&x.CATEGORIA===p.CATEGORIA&&x["SEGMENTO_SÉRIE"]===p["SEGMENTO_SÉRIE"]});
    var factor=current?newValue/current:1,rec=Object.assign({},p);
    rec.ID_PRODUTO=old&&old.ID_PRODUTO||destId;rec.ANO_LETIVO=destino;rec.ANO_ORIGEM=origem;rec.VALOR_ORIGEM=current;rec["REAJUSTE_%"]=pct;rec.PUBLICADO_ATENDIMENTO=pub;rec.ATUALIZADO_EM=now;rec.ATUALIZADO_POR=pwaUser_("Gestão");rec.ORIGEM="Reajuste individual "+origem+"→"+destino;rec.PRODUTO=String(p.PRODUTO||"").replace(String(origem),String(destino));
    rec.VALOR_BASE=newValue;
    ["VALOR_PÓS_VENCIMENTO","VALOR_CRÉDITO","VALOR_PARCELA"].forEach(function(k){if(p[k]!==""&&p[k]!=null)rec[k]=gfRoundMoneyPwa_(pwaNum_(p[k])*factor)});
    if(old)updateById_(S.PRODUTOS,"ID_PRODUTO",old.ID_PRODUTO,rec);else append_(S.PRODUTOS,rec);
    var hid=nextId_("REJ-",GF_TABS.REAJUSTES,"ID_REAJUSTE");
    append_(GF_TABS.REAJUSTES,{ID_REAJUSTE:hid,ANO_ORIGEM:origem,ANO_DESTINO:destino,ESCOPO:"Produto individual",CATEGORIA:p.CATEGORIA||"",SERIE:p["SEGMENTO_SÉRIE"]||"","PERCENTUAL_%":pct,QTD_ITENS:1,EXECUTADO_POR:pwaUser_("Gestão"),EXECUTADO_EM:now,STATUS:"Concluído",OBSERVACAO:(d.observacao||"")+" | Publicar: "+pub,LOTE_REFERENCIA:hid});
    audit_("Gestão","REAJUSTE_INDIVIDUAL","Produto",rec.ID_PRODUTO,JSON.stringify(p),JSON.stringify(rec));
    SpreadsheetApp.flush();
    return {ok:true,id:rec.ID_PRODUTO,produto:rec.PRODUTO,valor:newValue,percentual:pct};
  });
}

function pwaAtualizarProduto_(token,id,patch){
  pwaAdmin_(token);return pwaWithLock_(function(){
    var old=findById_(S.PRODUTOS,"ID_PRODUTO",id);if(!old)throw new Error("Produto não encontrado.");
    var allowed=["CATEGORIA","SUBCATEGORIA","PRODUTO","SEGMENTO_SÉRIE","DESCRIÇÃO","VALOR_BASE","VALOR_PÓS_VENCIMENTO","VALOR_CRÉDITO","QTD_PARCELAS","VALOR_PARCELA","VENCIMENTO_PADRÃO","ANO_LETIVO","ATIVO","OBSERVAÇÃO","TIPO_COBRANCA","DISPONIVEL_MATRICULA","ORDEM_EXIBICAO","OBSERVACAO_INTERNA","VALOR_ORIGEM","ANO_ORIGEM","REAJUSTE_%","PUBLICADO_ATENDIMENTO","ATUALIZADO_EM","ATUALIZADO_POR"],clean={};
    allowed.forEach(function(k){if(patch[k]!==undefined)clean[k]=patch[k]});
    ["VALOR_BASE","VALOR_PÓS_VENCIMENTO","VALOR_CRÉDITO","VALOR_PARCELA","VALOR_ORIGEM","REAJUSTE_%"].forEach(function(k){if(clean[k]!==undefined&&clean[k]!=="")clean[k]=pwaNum_(clean[k])});
    ["QTD_PARCELAS","ANO_LETIVO","ANO_ORIGEM","ORDEM_EXIBICAO"].forEach(function(k){if(clean[k]!==undefined&&clean[k]!=="")clean[k]=Number(clean[k])});
    clean.ATUALIZADO_EM=new Date();clean.ATUALIZADO_POR=pwaUser_("Gestão");
    updateById_(S.PRODUTOS,"ID_PRODUTO",id,clean);audit_("Gestão","EDITAR","Produto",id,JSON.stringify(old),JSON.stringify(clean));SpreadsheetApp.flush();return {ok:true,id:id};
  });
}
function importarLoteIntegracaoPwa_(token,data,modo,sessao){
  pwaAdmin_(token);data=data||{};
  var entity=String(data.entity||"").toLowerCase(),records=Array.isArray(data.records)?data.records:[],source=String(data.source||"Integração"),jobId=String(data.jobId||"");
  if(!records.length)throw new Error("Nenhum registro para importar.");
  if(records.length>200)throw new Error("Máximo de 200 registros por lote de integração.");
  var result={ok:true,entity:entity,jobId:jobId,source:source,recebidos:records.length,criados:0,atualizados:0,ignorados:0,erros:[]};
  return pwaWithLock_(function(){
    records.forEach(function(raw,index){
      try{
        var row=Object.assign({},raw||{});
        row.MODO_REGISTRO=pwaMode_(modo);row.SESSAO_TESTE=pwaMode_(modo)==="TESTE"?String(sessao||jobId||""):"";
        if(entity==="alunos"){
          var exists=row.ID_ALUNO?findById_(S.ALUNOS,"ID_ALUNO",row.ID_ALUNO):null;
          var res=salvarAluno(row);
          var id=res&&(res.id||res.ID_ALUNO)||row.ID_ALUNO||"";
          if(id)pwaMarkWhere_("ALUNOS","ID_ALUNO",id,modo,sessao||jobId);
          exists?result.atualizados++:result.criados++;
        }else if(entity==="responsaveis"){
          var oldR=row.ID_RESPONSAVEL?findById_(S.RESPONSAVEIS||"RESPONSAVEIS","ID_RESPONSAVEL",row.ID_RESPONSAVEL):null;
          var rr=salvarResponsavel(row);
          var rid=rr&&(rr.id||rr.ID_RESPONSAVEL)||row.ID_RESPONSAVEL||"";
          if(rid)pwaMarkWhere_("RESPONSAVEIS","ID_RESPONSAVEL",rid,modo,sessao||jobId);
          oldR?result.atualizados++:result.criados++;
        }else if(entity==="atendimentos"){
          var oldA=row.ID_ATENDIMENTO?findById_(GF_TABS.ATENDIMENTOS,"ID_ATENDIMENTO",row.ID_ATENDIMENTO):null;
          salvarAtendimentoPwa_(token,row,Array.isArray(row.ITENS)?row.ITENS:[],modo,sessao||jobId);
          oldA?result.atualizados++:result.criados++;
        }else if(entity==="produtos"){
          var oldP=row.ID_PRODUTO?findById_(S.PRODUTOS,"ID_PRODUTO",row.ID_PRODUTO):null;
          if(oldP){
            pwaAtualizarProduto_(token,row.ID_PRODUTO,row);result.atualizados++;
          }else{
            pwaCriarProdutoServico_(token,row);result.criados++;
          }
        }else if(entity==="matriculas"){
          var mid=row["ID_MATRÍCULA"]||row.ID_MATRICULA||"";
          var oldM=mid?findById_(S.MATRICULAS||"MATRICULAS","ID_MATRÍCULA",mid):null;
          if(oldM){
            result.ignorados++;
          }else{
            pwaCriarMatricula_(token,row,modo,sessao||jobId);result.criados++;
          }
        }else{
          throw new Error("Entidade não suportada.");
        }
      }catch(err){
        result.erros.push({linha:index+1,mensagem:String(err&&err.message||err)});
      }
    });
    audit_("Integração","IMPORTAR_LOTE",entity,jobId,"",JSON.stringify({source:source,recebidos:result.recebidos,criados:result.criados,atualizados:result.atualizados,ignorados:result.ignorados,erros:result.erros.length}));
    SpreadsheetApp.flush();
    result.ok=result.erros.length===0;
    return result;
  });
}

function aplicarReajusteCatalogoPwa_(token,d){
  pwaAdmin_(token);d=d||{};var origem=Number(d.anoOrigem),destino=Number(d.anoDestino),pct=pwaNum_(d.percentual),cat=String(d.categoria||"Todas"),pub=String(d.publicar||"Sim");
  if(!origem||!destino||origem===destino)throw new Error("Informe anos de origem e destino diferentes.");
  return pwaWithLock_(function(){
    var source=rows_(S.PRODUTOS).filter(function(p){return Number(p.ANO_LETIVO)===origem&&(cat==="Todas"||p.CATEGORIA===cat)});
    if(!source.length)throw new Error("Nenhum produto encontrado no ano de origem.");
    var dest=rows_(S.PRODUTOS).filter(function(p){return Number(p.ANO_LETIVO)===destino}),count=0,now=new Date(),factor=1+pct/100;
    source.forEach(function(p){
      var id=String(p.ID_PRODUTO||"").indexOf(String(origem))>=0?String(p.ID_PRODUTO).replace(String(origem),String(destino)):String(p.ID_PRODUTO||"")+"-"+destino;
      var old=dest.find(function(x){return x.ID_PRODUTO===id||x.PRODUTO===String(p.PRODUTO||"").replace(String(origem),String(destino))&&x.CATEGORIA===p.CATEGORIA&&x["SEGMENTO_SÉRIE"]===p["SEGMENTO_SÉRIE"]}),rec=Object.assign({},p);
      rec.ID_PRODUTO=old&&old.ID_PRODUTO||id;rec.ANO_LETIVO=destino;rec.ANO_ORIGEM=origem;rec.VALOR_ORIGEM=pwaNum_(p.VALOR_BASE);rec["REAJUSTE_%"]=pct;rec.PUBLICADO_ATENDIMENTO=pub;rec.ATUALIZADO_EM=now;rec.ATUALIZADO_POR=pwaUser_("Gestão");rec.ORIGEM="Reajuste "+origem+"→"+destino;rec.PRODUTO=String(p.PRODUTO||"").replace(String(origem),String(destino));
      ["VALOR_BASE","VALOR_PÓS_VENCIMENTO","VALOR_CRÉDITO","VALOR_PARCELA"].forEach(function(k){if(p[k]!==""&&p[k]!=null)rec[k]=Math.round(pwaNum_(p[k])*factor*100)/100});
      if(old)updateById_(S.PRODUTOS,"ID_PRODUTO",old.ID_PRODUTO,rec);else append_(S.PRODUTOS,rec);count++;
    });
    var hid=nextId_("REJ-",GF_TABS.REAJUSTES,"ID_REAJUSTE");append_(GF_TABS.REAJUSTES,{ID_REAJUSTE:hid,ANO_ORIGEM:origem,ANO_DESTINO:destino,ESCOPO:cat==="Todas"?"Todos os produtos":"Categoria",CATEGORIA:cat,SERIE:"","PERCENTUAL_%":pct,QTD_ITENS:count,EXECUTADO_POR:pwaUser_("Gestão"),EXECUTADO_EM:now,STATUS:"Concluído",OBSERVACAO:"Publicar no atendimento: "+pub,LOTE_REFERENCIA:hid});
    audit_("Gestão","REAJUSTE_LOTE","Produtos",hid,"",JSON.stringify({origem:origem,destino:destino,pct:pct,categoria:cat,quantidade:count}));SpreadsheetApp.flush();return {ok:true,quantidade:count,lote:hid};
  });
}

function doPost(e){
  var requestId=Utilities.getUuid();
  try{
    var body=pwaParseBody_(e),action=String(body.action||"").trim();if(!action)throw new Error("Ação não informada.");
    if(action==="health")return pwaJson_({ok:true,service:"Gestão Futuro API",version:PWA_API_VERSION,capabilities:PWA_CAPABILITIES,requestId:requestId,time:new Date().toISOString()});
    pwaRequireGateway_(body.gatewayKey);var data;
    switch(action){
      case "loginGestao":data=loginGestao(body.password||"");break;
      case "loginSecretaria":data=loginSecretaria(body.password||"");break;
      case "logout":data=logoutGestao(body.token||"");break;
      case "bootstrapSecretaria":data=pwaBootstrapSecretaria_(body.token,body.modo);break;
      case "salvarAluno":data=pwaSalvarAluno_(body.token,body.data,body.modo,body.sessaoTeste);break;
      case "salvarResponsavel":data=pwaSalvarResponsavel_(body.token,body.data,body.modo,body.sessaoTeste);break;
      case "criarMatriculaCompleta":data=pwaCriarMatricula_(body.token,body.data,body.modo,body.sessaoTeste);break;
      case "atualizarDocumento":data=pwaAtualizarDocumento_(body.token,body.id||(body.data&&body.data.ID_DOCUMENTO),body.data||{},body.modo,body.sessaoTeste);break;
      case "listarDocumentosAluno":data=pwaListarDocumentosAluno_(body.token,body.idAluno,body.modo);break;
      case "adicionarDocumentoAluno":data=pwaAdicionarDocumentoAluno_(body.token,body.data||{},body.modo,body.sessaoTeste);break;
      case "listarRecebimentosAluno":data=pwaListarRecebimentosAluno_(body.token,body.idAluno,body.modo);break;
      case "listarProdutosPublicos":data=listarProdutosPublicos();break;
      case "dashboardPublico":data=pwaDashboardPublico_(body.modo);break;
      case "dashboardGestao":data=pwaDashboardGestao_(body.token,body.modo);break;
      case "listarRecebimentos":data=pwaListarRecebimentos_(body.token,body.modo);break;
      case "listarCaixa":data=pwaListarCaixa_(body.token,body.modo);break;
      case "listarProdutosGestao":data=listarProdutosGestao(body.token);break;
      case "atualizarProduto":pwaRequireProduction_(body.modo,"Atualização de produto");data=pwaAtualizarProduto_(body.token,body.id,body.data||{});break;
      case "criarProdutoServico":pwaRequireProduction_(body.modo,"Criação de produto/serviço");data=pwaCriarProdutoServico_(body.token,body.data||{});break;
      case "aplicarReajusteIndividual":pwaRequireProduction_(body.modo,"Reajuste individual");data=aplicarReajusteIndividualPwa_(body.token,body.data||{});break;
      case "listarBeneficios":data=listarBeneficios(body.token);break;
      case "listarCategorias":data=listarCategorias(body.token);break;
      case "getFechamento":data=pwaGetFechamento_(body.token,body.modo);break;
      case "gerarResumoAluno":data=gerarResumoAluno(body.token,body.idAluno);break;
      case "registrarPagamento":data=pwaRegistrarPagamento_(body.token,body.data||{},body.modo,body.sessaoTeste);break;
      case "salvarMovimentoCaixa":data=pwaSalvarMovimentoCaixa_(body.token,body.data||{},body.modo,body.sessaoTeste);break;
      case "excluirMovimentoCaixa":data=pwaExcluirMovimentoCaixa_(body.token,body.id,body.modo);break;
      case "listarAtendimentos":data=listarAtendimentosPwa_(body.token,body.modo);break;
      case "getAtendimento":data=getAtendimentoPwa_(body.token,body.id,body.modo);break;
      case "salvarAtendimento":data=salvarAtendimentoPwa_(body.token,body.data,body.itens,body.modo,body.sessaoTeste);break;
      case "solicitarDesconto":data=solicitarDescontoPwa_(body.token,body.data,body.modo,body.sessaoTeste);break;
      case "listarSolicitacoesDesconto":data=listarSolicitacoesDescontoPwa_(body.token,body.modo);break;
      case "decidirSolicitacaoDesconto":data=decidirSolicitacaoDescontoPwa_(body.token,body.id,body.status,body.valorAutorizado,body.observacao,body.modo);break;
      case "getPanfletoSerie":data=getPanfletoSeriePwa_(body.token,body.ano,body.serie);break;
      case "salvarPanfletoSerie":pwaRequireProduction_(body.modo,"Edição de panfleto");data=salvarPanfletoSeriePwa_(body.token,body.ano,body.serie,body.data);break;
      case "aplicarReajusteCatalogo":pwaRequireProduction_(body.modo,"Reajuste em lote");data=aplicarReajusteCatalogoPwa_(body.token,body.data);break;
      case "importarLoteIntegracao":data=importarLoteIntegracaoPwa_(body.token,body.data,body.modo,body.sessaoTeste);break;
      case "limparAutorizacoesTeste":data=limparAutorizacoesTestePwa_(body.token);break;
      case "limparDadosTeste":data=limparDadosTestePwa_(body.token);break;
      default:throw new Error("Ação não reconhecida: "+action);
    }
    return pwaJson_({ok:true,requestId:requestId,data:data});
  }catch(err){
    var debug=PropertiesService.getScriptProperties().getProperty(PWA_DEBUG_PROP)==="true";console.error("PWA API "+requestId+": "+(err&&err.stack?err.stack:err));
    return pwaJson_({ok:false,requestId:requestId,error:err&&err.message?err.message:"Erro interno.",debug:debug&&err&&err.stack?String(err.stack):undefined});
  }
}
