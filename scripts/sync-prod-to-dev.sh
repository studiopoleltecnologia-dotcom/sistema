#!/usr/bin/env bash
# ============================================================
# Sync ESTRITAMENTE unidirecional PROD -> DEV, apenas dados de NEGÓCIO.
#
# Garantias de sentido único:
#  - PROD_DB_URL DEVE ser um papel READ-ONLY na produção (não escreve em prod
#    nem por engano). DEV_DB_URL é o postgres do projeto de desenvolvimento.
#  - aborta se as duas URLs forem iguais.
#
# NUNCA copia: auth.*, contas_aluna, contas_professora, equipe_convites,
# emails_fila (fila de e-mail), storage.*, nenhum segredo.
#
# Lacuna documentada: `socias` é copiada (id/nome/funcao) para os nomes de
# responsável/autoria resolverem. Como `socias.id = auth.uid()`, após um sync
# o login de equipe do DEV precisa ser recriado (criar usuário de auth no DEV
# e promover). O auth do DEV é independente do de produção.
# ============================================================
set -euo pipefail

: "${PROD_DB_URL:?defina PROD_DB_URL (papel read-only da produção)}"
: "${DEV_DB_URL:?defina DEV_DB_URL (postgres do projeto dev)}"
if [ "$PROD_DB_URL" = "$DEV_DB_URL" ]; then
  echo "ERRO: PROD_DB_URL == DEV_DB_URL — abortando por segurança." >&2
  exit 1
fi

TABELAS=(
  salas modalidades planos professoras socias clientes
  turmas matriculas creditos_eventos agendamentos agendamentos_eventos presencas lista_espera
  interacoes_crm movimentacoes_funil followups followup_regras
  categorias_saida entradas_financeiras saidas_financeiras reserva_movimentos despesas_recorrentes
  fechamentos_professora fechamento_ajustes
  checklist_itens checklist_execucoes tarefas
  config_agendamento config_financeiro
)

echo "==> dump data-only da PRODUÇÃO (${#TABELAS[@]} tabelas de negócio)"
DUMP="$(mktemp)"
dump_args=(); for t in "${TABELAS[@]}"; do dump_args+=(--table="public.$t"); done
pg_dump "$PROD_DB_URL" --data-only --no-owner --no-privileges "${dump_args[@]}" > "$DUMP"

echo "==> limpando as mesmas tabelas no DEV (replica mode: sem cascata/FK)"
{
  echo "set session_replication_role = replica;"
  for t in "${TABELAS[@]}"; do echo "delete from public.$t;"; done
} | psql "$DEV_DB_URL" -v ON_ERROR_STOP=1 --single-transaction

echo "==> carregando os dados no DEV"
{
  echo "set session_replication_role = replica;"
  cat "$DUMP"
} | psql "$DEV_DB_URL" -v ON_ERROR_STOP=1 --single-transaction

rm -f "$DUMP"
echo "==> Sync PROD -> DEV concluído."
