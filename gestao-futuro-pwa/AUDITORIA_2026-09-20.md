# Auditoria Técnica — Gestão Futuro

Data: 20/09/2026  
Domínio oficial: https://gestao.colegiofuturoce.com.br  
Branch: `gestao-futuro-pwa`

## Estado geral

A plataforma está publicada no domínio institucional, com HTTPS ativo, PWA, funções Netlify, integração com Google Sheets e separação de perfis Secretaria/Gestão.

A auditoria identificou e corrigiu riscos importantes na separação entre **Produção** e **Teste/Simulação**. O frontend agora bloqueia o ambiente de teste quando a API do Apps Script publicada não declarar explicitamente as capacidades de isolamento exigidas.

## Correções aplicadas

- API versionada como `2026.09.20.2`.
- Health check passa a informar capacidades do backend.
- Bloqueio de Teste/Simulação quando o Apps Script publicado estiver desatualizado.
- Botão **Limpar teste** só é habilitado quando a API publicada confirmar suporte.
- Separação por modo em:
  - alunos;
  - responsáveis;
  - atendimentos;
  - itens de atendimento;
  - solicitações de desconto;
  - matrículas;
  - documentos;
  - recebimentos;
  - caixa;
  - fechamento financeiro.
- Proteção contra edição, em Teste, de registros pertencentes à Produção.
- Catálogo, reajustes e configuração de panfletos ficam restritos à Produção enquanto não existir catálogo-sombra para simulação.
- Fechamento no modo Teste é calculado somente com movimentações marcadas como TESTE.
- Domínio antigo `.netlify.app` recebe redirecionamento para o domínio oficial.
- Headers de segurança reforçados: HSTS, CSP, X-Frame-Options e nosniff.
- Ícone oficial da Agenda On-line / Gestor Escolar corrigido.
- Cache do PWA atualizado.

## Auditoria da API

Foram encontradas **33 ações chamadas pelo frontend** e todas possuem rota correspondente no backend atual do repositório.

Rotas existentes no backend sem chamada direta pelo frontend atual:
- `gerarResumoAluno`
- `importarLoteIntegracao`
- `listarBeneficios`
- `listarRecebimentosAluno`

Isso não representa erro; são rotas auxiliares ou reservadas a outros fluxos.

## Auditoria do banco

Estrutura atual verificada:

- ALUNOS
- RESPONSAVEIS
- MATRICULAS
- DOCUMENTOS_ALUNO
- ATENDIMENTOS
- ATENDIMENTO_ITENS
- SOLICITACOES_DESCONTO
- RECEBIMENTOS
- CAIXA
- PRODUTOS
- FECHAMENTO
- AUDITORIA
- demais tabelas de configuração e integração

Não foram encontrados IDs duplicados nas tabelas transacionais verificadas.

Também não foram encontradas referências órfãs entre os registros atualmente preenchidos nas relações verificadas.

No momento da auditoria, **nenhuma linha transacional estava marcada como TESTE**. Portanto, o modo de teste exibido anteriormente pela interface não estava sendo persistido de forma confiável pela versão do Apps Script que estava publicada.

Catálogo:
- 72 registros cadastrados;
- 36 referentes a 2026;
- 36 referentes a 2027;
- 2 registros inativos;
- nenhum ID duplicado.

## Segurança e infraestrutura

Aprovado:
- HTTPS no domínio oficial;
- tokens de sessão armazenados em `sessionStorage`, não em `localStorage`;
- nenhum token/senha encontrado em chaves sensíveis de `localStorage`;
- links com `target="_blank"` sem ocorrência insegura identificada;
- CSP, HSTS, frame deny e nosniff ativos;
- três funções Netlify publicadas: gateway, integrations e push;
- varredura de segredos do último deploy sem correspondências detectadas.

Pontos a melhorar:
- dependências do `package.json` ainda usam `latest`;
- não há lockfile versionado;
- há chamadas nativas de `alert()` e `confirm()` que podem ser substituídas por modais padronizados;
- a integração remota deve futuramente receber política de allowlist de hosts, além das validações atuais;
- falta uma suíte automatizada de testes/smoke tests no repositório.

## Passo obrigatório para concluir a correção do Teste/Simulação

O arquivo `backend/ApiPwa.gs` já está corrigido no GitHub, porém o Google Apps Script publicado precisa receber uma **nova versão do mesmo deployment**.

Após publicar, o health check deve apresentar:

`API 2026.09.20.2`

Só então o sistema habilitará Teste/Simulação e o botão **Limpar teste**.

### Teste de homologação após publicar

1. Entrar como Gestão.
2. Selecionar Teste/Simulação.
3. Criar uma movimentação pequena de teste.
4. Conferir no banco:
   - `MODO_REGISTRO = TESTE`
   - `SESSAO_TESTE` preenchida.
5. Confirmar que o fechamento do teste mostra apenas a movimentação de teste.
6. Clicar em **Limpar teste**.
7. Confirmar que a linha TESTE foi removida.
8. Confirmar que nenhum registro de Produção foi alterado.

## Status

- Frontend: **publicado**
- Domínio/HTTPS: **ok**
- Netlify: **deploy ready**
- Banco: **estrutura validada**
- Produção/Teste no código: **corrigido**
- Publicação do Apps Script: **pendente**
- Homologação final do Teste/Limpeza: **aguardando publicação do Apps Script**
