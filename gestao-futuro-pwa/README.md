# Gestão Futuro PWA

PWA escolar do Colégio Futuro.

## Arquitetura

Navegador/PWA -> Netlify Function `/api/gf` -> Google Apps Script -> Google Sheets.

A chave `FUTURO_PWA_GATEWAY_KEY` fica exclusivamente nas variáveis de ambiente do Netlify. Nunca deve ser colocada em HTML, JavaScript público ou repositório.

## Netlify

Configure a variável secreta `FUTURO_PWA_GATEWAY_KEY` com a chave atual armazenada nas Propriedades do Script do Apps Script. Use escopo de runtime/functions em produção.

## Módulos

Dashboard, Alunos, Responsáveis, Matrículas, Documentos, Produtos e mensalidades, Recebimentos, Caixa e Fechamento.

## Segurança

A Secretaria e a Gestão usam sessões temporárias emitidas pelo Apps Script. A área financeira exige sessão administrativa. A PWA não contém a gateway key.
