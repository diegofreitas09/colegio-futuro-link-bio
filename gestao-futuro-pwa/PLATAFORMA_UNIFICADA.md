# Gestão Futuro — Plataforma Unificada

## Regra principal
Uma única plataforma, um único banco oficial e um único fluxo de dados. Não criar novos projetos paralelos para Secretaria, Atendimento, Gestão ou Financeiro.

## Módulos
1. Dashboard executivo
2. Atendimento de matrículas / CRM
3. Secretaria
4. Base de alunos e rematrícula
5. Produtos, mensalidades e reajustes
6. Aprovações de desconto
7. Panfletos e proposta por série
8. Matrículas e contratos
9. Recebimentos e fluxo de caixa
10. Fechamento financeiro
11. Relatórios e auditoria

## Perfis
- Atendimento: consulta preços publicados, cria/edita atendimento, gera proposta, solicita desconto.
- Secretaria: alunos, responsáveis, documentos, matrícula e rematrícula.
- Gestão/Direção: edita valores, aplica reajustes, autoriza descontos, vê fechamento e relatórios.
- Financeiro: recebimentos, caixa, fechamento e inadimplência.

## Ano letivo
A tabela PRODUTOS é única e usa ANO_LETIVO. O gestor escolhe ano origem/destino e aplica percentual global, por categoria, segmento, série ou item. O histórico não é apagado.
Somente produtos com PUBLICADO_ATENDIMENTO=Sim aparecem no atendimento.

## Atendimento
Etapas: Contato -> Perfil -> Interesse -> Visita -> Proposta -> Decisão -> Matriculado, com opção Perdido.
Ao escolher ano + série, o sistema puxa automaticamente mensalidades, material, fardamento, adicionais e observações daquele ano/série.
O atendimento grava um snapshot dos itens apresentados para preservar o histórico.

## Desconto
Atendimento não altera tabela oficial.
Pedidos fora da condição permitida entram em SOLICITACOES_DESCONTO.
Direção autoriza, ajusta ou nega.
Enquanto pendente, fechamento fica bloqueado.
A PWA alerta a gestão com badge, som, vibração (quando suportado) e notificação no navegador.

## Panfleto por série
Ao escolher ano + série, gerar um documento/PDF com:
- identidade do Colégio Futuro;
- mensalidades e planos publicados;
- material didático;
- fardamento;
- serviços/adicionais;
- o que a escola oferece;
- documentos de novato/veterano;
- observações comerciais;
- contato/CTA.
Valores vêm do catálogo oficial; textos institucionais vêm de PANFLETOS_SERIE.

## Rematrícula
Importações de 2026 entram na mesma base de ALUNOS, sem duplicar pessoa.
Ao abrir um veterano, o sistema pergunta se seguirá para 2027.
Confirmando, cria nova matrícula para 2027 preservando o histórico de 2026.
Importações ficam registradas em IMPORTACOES_ALUNOS.

## Banco oficial
Google Sheets: GESTÃO FUTURO - BANCO DE DADOS.
Abas existentes são preservadas. Novas abas:
- ANOS_LETIVOS
- ATENDIMENTOS
- ATENDIMENTO_ITENS
- SOLICITACOES_DESCONTO
- PANFLETOS_SERIE
- HISTORICO_REAJUSTES
- IMPORTACOES_ALUNOS

## Arquitetura
PWA Netlify -> função server-side /api/gf -> Apps Script -> Google Sheets.
Segredos ficam no backend.
Operações críticas usam sessão, auditoria e LockService.

## Próximas integrações
Aluno -> Professores -> Família/Responsáveis, sem criar cadastros paralelos.
