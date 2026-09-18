
/**
 * Gestão Futuro — API única da PWA
 * Este arquivo deve substituir o conteúdo atual de ApiPwa.gs no MESMO projeto Apps Script.
 * O Código.gs existente permanece como base de Secretaria/Financeiro.
 */
const PWA_API_VERSION="UNIFICADA";
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
  console.log("FUTURO_PWA_GATEWAY_KEY="+key);return key;
}
function gerarGatewayPwa(){return gerarGatewayPwa_()}
function rotacionarGatewayPwa(){
  var key=sha256_(Utilities.getUuid()+Utilities.getUuid()+String(Date.now())+Utilities.getUuid());
  PropertiesService.getScriptProperties().setProperty(PWA_GATEWAY_PROP,key);
  console.log("NOVA_CHAVE_GERADA_COM_SUCESSO");return key;
}
function pwaRequireGateway_(key){var exp=pwaGatewayKey_();if(!exp)throw new Error("Gateway da PWA ainda não foi configurado.");if(!pwaSafeEqual_(key,exp))throw new Error("Gateway não autorizado.")}
function pwaNewSession_(role){var token=Utilities.getUuid()+Utilities.getUuid();CacheService.getScriptCache().put("gf:"+token,role,PWA_SESSION_TTL);return {ok:true,token:token,role:role,expiresIn:PWA_SESSION_TTL}}
function loginSecretaria(password){
  var props=PropertiesService.getScriptProperties(),expected=props.getProperty(PWA_STAFF_HASH_PROP)||(typeof ADMIN_PASSWORD_SHA256!=="undefined"?ADMIN_PASSWORD_SHA256:"");
  if(!expected)throw new Error("Senha da Secretaria ainda não foi configurada.");
  if(!pwaSafeEqual_(sha256_(password),expected)){audit_("Secretaria","LOGIN_NEGADO","Sessão","","","");return {ok:false,message:"Senha inválida."}}
  var s=pwaNewSession_("secretaria");audit_("Secretaria","LOGIN_OK","Sessão","","","");return s;
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
function pwaUser_(fallback){return Session.getActiveUser().getEmail()||fallback||"PWA"}
function pwaNum_(v){var n=Number(String(v==null?"":v).replace(",","."));return Number.isFinite(n)?n:0}
function gfRoundMoneyPwa_(v){return Math.round((Number(v||0)+Number.EPSILON)*100)/100}
function pwaSlug_(v){return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-Z0-9]+/g,"-").replace(/^-+|-+$/g,"")}
function pwaNorm_(v){return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()}
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
function pwaBootstrapSecretaria_(token){pwaStaff_(token);var b=bootstrap();try{b.itensContrato=rows_("ITENS_CONTRATO")}catch(e){b.itensContrato=[]}return b}
function pwaAtualizarDocumento_(token,id,patch){pwaStaff_(token);return pwaWithLock_(function(){return atualizarDocumento(id,patch||{})})}
function pwaListarDocumentosAluno_(token,idAluno){pwaStaff_(token);return listarDocumentosAluno(idAluno)}
function pwaListarRecebimentosAluno_(token,idAluno){pwaStaff_(token);return listarRecebimentosAluno(idAluno)}
function pwaSalvarAluno_(token,data){pwaStaff_(token);return pwaWithLock_(function(){return salvarAluno(data||{})})}
function pwaSalvarResponsavel_(token,data){pwaStaff_(token);return pwaWithLock_(function(){return salvarResponsavel(data||{})})}
function pwaCriarMatricula_(token,data){
  pwaStaff_(token);data=data||{};
  return pwaWithLock_(function(){
    var res=criarMatriculaCompleta(data||{}),id=res&& (res.id||res["ID_MATRÍCULA"]||res.ID_MATRICULA)||"",services=[];
    try{services=JSON.parse(String(data.SERVICOS_ADICIONAIS||"[]"))}catch(e){services=[]}
    if(id&&Array.isArray(services)&&services.length){
      services.forEach(function(s){
        var p=findById_(S.PRODUTOS,"ID_PRODUTO",s.ID_PRODUTO)||{},iid=nextId_("ITC-","ITENS_CONTRATO","ID_ITEM"),qtd=1,unit=pwaNum_(s.VALOR||p.VALOR_BASE);
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
          "OBSERVAÇÃO":"Adicionado pela Gestão Futuro • "+String(p["DESCRIÇÃO"]||p["OBSERVAÇÃO"]||"")
        });
      });
      audit_("Secretaria","ADICIONAR_SERVICOS_MATRICULA","Matrícula",id,"",JSON.stringify(services));
      SpreadsheetApp.flush();
    }
    if(res&&typeof res==="object")res.servicos=services.length;
    return res;
  })
}

function listarAtendimentosPwa_(token){pwaStaff_(token);return rows_(GF_TABS.ATENDIMENTOS)}
function getAtendimentoPwa_(token,id){
  pwaStaff_(token);
  var atendimento=findById_(GF_TABS.ATENDIMENTOS,"ID_ATENDIMENTO",id);
  if(!atendimento)throw new Error("Atendimento não encontrado.");
  var itens=rows_(GF_TABS.ITENS_ATENDIMENTO).filter(function(x){return x.ID_ATENDIMENTO===id&&x.SELECIONADO!=="Não"});
  return {atendimento:atendimento,itens:itens};
}
function salvarAtendimentoPwa_(token,data,itens){
  pwaStaff_(token);data=data||{};itens=Array.isArray(itens)?itens:[];
  if(!data.NOME_ALUNO||!data.ANO_LETIVO||!data.SERIE_PRETENDIDA)throw new Error("Aluno, ano letivo e série são obrigatórios.");
  return pwaWithLock_(function(){
    var id=String(data.ID_ATENDIMENTO||"").trim(),old=id?findById_(GF_TABS.ATENDIMENTOS,"ID_ATENDIMENTO",id):null,now=new Date();
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
      ECONOMIA_PLANO:pwaNum_(data.ECONOMIA_PLANO)
    };
    if(old)updateById_(GF_TABS.ATENDIMENTOS,"ID_ATENDIMENTO",id,rec);else append_(GF_TABS.ATENDIMENTOS,rec);
    var existentes=rows_(GF_TABS.ITENS_ATENDIMENTO).filter(function(x){return x.ID_ATENDIMENTO===id});
    existentes.forEach(function(x){updateById_(GF_TABS.ITENS_ATENDIMENTO,"ID_ITEM_ATENDIMENTO",x.ID_ITEM_ATENDIMENTO,{SELECIONADO:"Não",ATUALIZADO_EM:now})});
    itens.forEach(function(x){
      var ex=existentes.find(function(e){return e.ID_PRODUTO===x.ID_PRODUTO}),iid=ex&&ex.ID_ITEM_ATENDIMENTO||nextId_("ATI-",GF_TABS.ITENS_ATENDIMENTO,"ID_ITEM_ATENDIMENTO"),item={
        ID_ITEM_ATENDIMENTO:iid,ID_ATENDIMENTO:id,ID_PRODUTO:x.ID_PRODUTO||"",ANO_LETIVO:Number(data.ANO_LETIVO),PRODUTO:x.PRODUTO||"",CATEGORIA:x.CATEGORIA||"",SERIE:data.SERIE_PRETENDIDA||"",QTD:Number(x.QTD||1),VALOR_TABELA:pwaNum_(x.VALOR_TABELA),"DESCONTO_%":pwaNum_(x.DESCONTO),VALOR_APRESENTADO:pwaNum_(x.VALOR_APRESENTADO||x.VALOR_TABELA),OBRIGATORIO:x.OBRIGATORIO||"Não",SELECIONADO:"Sim",OBSERVACAO:x.OBSERVACAO||"",CRIADO_EM:ex&&ex.CRIADO_EM||now,ATUALIZADO_EM:now
      };
      if(ex)updateById_(GF_TABS.ITENS_ATENDIMENTO,"ID_ITEM_ATENDIMENTO",iid,item);else append_(GF_TABS.ITENS_ATENDIMENTO,item);
    });
    audit_("Atendimento",old?"EDITAR":"CRIAR","Atendimento",id,old?JSON.stringify(old):"",JSON.stringify(rec));
    SpreadsheetApp.flush();return {ok:true,id:id,total:rec.TOTAL_PROPOSTA};
  });
}

function solicitarDescontoPwa_(token,d){
  pwaStaff_(token);d=d||{};
  if(!d.ID_ATENDIMENTO||!d.ID_PRODUTO)throw new Error("Atendimento e produto são obrigatórios.");
  return pwaWithLock_(function(){
    var at=findById_(GF_TABS.ATENDIMENTOS,"ID_ATENDIMENTO",d.ID_ATENDIMENTO);if(!at)throw new Error("Atendimento não encontrado.");
    var prod=findById_(S.PRODUTOS,"ID_PRODUTO",d.ID_PRODUTO),id=nextId_("SOL-",GF_TABS.SOLICITACOES,"ID_SOLICITACAO"),now=new Date();
    append_(GF_TABS.SOLICITACOES,{
      ID_SOLICITACAO:id,ID_ATENDIMENTO:d.ID_ATENDIMENTO,ID_ALUNO:at.ID_ALUNO||"",ID_PRODUTO:d.ID_PRODUTO,ANO_LETIVO:Number(d.ANO_LETIVO||at.ANO_LETIVO),SERIE:d.SERIE||at.SERIE_PRETENDIDA||"",VALOR_TABELA:pwaNum_(d.VALOR_TABELA), "DESCONTO_SOLICITADO_%":pwaNum_(d.DESCONTO_SOLICITADO),VALOR_SOLICITADO:pwaNum_(d.VALOR_SOLICITADO),MOTIVO:d.MOTIVO||"",STATUS:"Aguardando",VALOR_AUTORIZADO:"",OBSERVACAO_GESTAO:"",SOLICITADO_POR:pwaUser_("Atendimento"),SOLICITADO_EM:now,DECIDIDO_POR:"",DECIDIDO_EM:"",ALERTA_ENVIADO:"Não",CONCLUIDO_EM:"",OBSERVACAO_FINAL:""
    });
    updateById_(GF_TABS.ATENDIMENTOS,"ID_ATENDIMENTO",d.ID_ATENDIMENTO,{PEDIDO_DESCONTO_PENDENTE:"Sim",ATUALIZADO_EM:now});
    audit_("Atendimento","SOLICITAR_DESCONTO","Solicitação",id,"",JSON.stringify(d));SpreadsheetApp.flush();return {ok:true,id:id,produto:prod&&prod.PRODUTO||""};
  });
}
function listarSolicitacoesDescontoPwa_(token){
  pwaAdmin_(token);var ats=rows_(GF_TABS.ATENDIMENTOS),ps=rows_(S.PRODUTOS);
  return rows_(GF_TABS.SOLICITACOES).map(function(r){var a=ats.find(function(x){return x.ID_ATENDIMENTO===r.ID_ATENDIMENTO}),p=ps.find(function(x){return x.ID_PRODUTO===r.ID_PRODUTO});r.ALUNO=a&&a.NOME_ALUNO||r.ID_ALUNO||"";r.PRODUTO=p&&p.PRODUTO||r.ID_PRODUTO||"";r.RESPONSAVEL=a&&a.RESPONSAVEL||"";return r}).reverse();
}
function decidirSolicitacaoDescontoPwa_(token,id,status,valor,obs){
  pwaAdmin_(token);if(["Autorizado","Negado"].indexOf(status)<0)throw new Error("Decisão inválida.");
  return pwaWithLock_(function(){
    var r=findById_(GF_TABS.SOLICITACOES,"ID_SOLICITACAO",id);if(!r)throw new Error("Solicitação não encontrada.");
    var now=new Date(),patch={STATUS:status,VALOR_AUTORIZADO:status==="Autorizado"?pwaNum_(valor):"",OBSERVACAO_GESTAO:obs||"",DECIDIDO_POR:pwaUser_("Gestão"),DECIDIDO_EM:now};
    updateById_(GF_TABS.SOLICITACOES,"ID_SOLICITACAO",id,patch);
    if(status==="Autorizado"){
      var item=rows_(GF_TABS.ITENS_ATENDIMENTO).find(function(x){return x.ID_ATENDIMENTO===r.ID_ATENDIMENTO&&x.ID_PRODUTO===r.ID_PRODUTO&&x.SELECIONADO==="Sim"});
      if(item){var table=pwaNum_(r.VALOR_TABELA),aut=pwaNum_(valor),desc=table?((table-aut)/table)*100:0;updateById_(GF_TABS.ITENS_ATENDIMENTO,"ID_ITEM_ATENDIMENTO",item.ID_ITEM_ATENDIMENTO,{"DESCONTO_%":desc,VALOR_APRESENTADO:aut,ATUALIZADO_EM:now})}
    }
    var pend=rows_(GF_TABS.SOLICITACOES).filter(function(x){return x.ID_ATENDIMENTO===r.ID_ATENDIMENTO&&x.ID_SOLICITACAO!==id&&x.STATUS==="Aguardando"});
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
    if(action==="health")return pwaJson_({ok:true,service:"Gestão Futuro API",version:PWA_API_VERSION,requestId:requestId,time:new Date().toISOString()});
    pwaRequireGateway_(body.gatewayKey);var data;
    switch(action){
      case "loginGestao":data=loginGestao(body.password||"");break;
      case "loginSecretaria":data=loginSecretaria(body.password||"");break;
      case "logout":data=logoutGestao(body.token||"");break;
      case "bootstrapSecretaria":data=pwaBootstrapSecretaria_(body.token);break;
      case "salvarAluno":data=pwaSalvarAluno_(body.token,body.data);break;
      case "salvarResponsavel":data=pwaSalvarResponsavel_(body.token,body.data);break;
      case "criarMatriculaCompleta":data=pwaCriarMatricula_(body.token,body.data);break;
      case "atualizarDocumento":data=pwaAtualizarDocumento_(body.token,body.id||(body.data&&body.data.ID_DOCUMENTO),body.data||{});break;
      case "listarDocumentosAluno":data=pwaListarDocumentosAluno_(body.token,body.idAluno);break;
      case "listarRecebimentosAluno":data=pwaListarRecebimentosAluno_(body.token,body.idAluno);break;
      case "listarProdutosPublicos":data=listarProdutosPublicos();break;
      case "dashboardPublico":data=getDashboard();break;
      case "dashboardGestao":data=getDashboardGestao(body.token);break;
      case "listarRecebimentos":data=listarRecebimentos(body.token);break;
      case "listarCaixa":data=listarCaixa(body.token);break;
      case "listarProdutosGestao":data=listarProdutosGestao(body.token);break;
      case "atualizarProduto":data=pwaAtualizarProduto_(body.token,body.id,body.data||{});break;
      case "criarProdutoServico":data=pwaCriarProdutoServico_(body.token,body.data||{});break;
      case "aplicarReajusteIndividual":data=aplicarReajusteIndividualPwa_(body.token,body.data||{});break;
      case "listarBeneficios":data=listarBeneficios(body.token);break;
      case "listarCategorias":data=listarCategorias(body.token);break;
      case "getFechamento":data=getFechamento(body.token);break;
      case "gerarResumoAluno":data=gerarResumoAluno(body.token,body.idAluno);break;
      case "registrarPagamento":data=pwaWithLock_(function(){return registrarPagamento(body.token,body.data||{})});break;
      case "salvarMovimentoCaixa":data=pwaWithLock_(function(){return salvarMovimentoCaixa(body.token,body.data||{})});break;
      case "listarAtendimentos":data=listarAtendimentosPwa_(body.token);break;
      case "getAtendimento":data=getAtendimentoPwa_(body.token,body.id);break;
      case "salvarAtendimento":data=salvarAtendimentoPwa_(body.token,body.data,body.itens);break;
      case "solicitarDesconto":data=solicitarDescontoPwa_(body.token,body.data);break;
      case "listarSolicitacoesDesconto":data=listarSolicitacoesDescontoPwa_(body.token);break;
      case "decidirSolicitacaoDesconto":data=decidirSolicitacaoDescontoPwa_(body.token,body.id,body.status,body.valorAutorizado,body.observacao);break;
      case "getPanfletoSerie":data=getPanfletoSeriePwa_(body.token,body.ano,body.serie);break;
      case "salvarPanfletoSerie":data=salvarPanfletoSeriePwa_(body.token,body.ano,body.serie,body.data);break;
      case "aplicarReajusteCatalogo":data=aplicarReajusteCatalogoPwa_(body.token,body.data);break;
      default:throw new Error("Ação não reconhecida: "+action);
    }
    return pwaJson_({ok:true,requestId:requestId,data:data});
  }catch(err){
    var debug=PropertiesService.getScriptProperties().getProperty(PWA_DEBUG_PROP)==="true";console.error("PWA API "+requestId+": "+(err&&err.stack?err.stack:err));
    return pwaJson_({ok:false,requestId:requestId,error:err&&err.message?err.message:"Erro interno.",debug:debug&&err&&err.stack?String(err.stack):undefined});
  }
}
