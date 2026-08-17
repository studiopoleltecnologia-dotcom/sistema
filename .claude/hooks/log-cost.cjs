#!/usr/bin/env node
// Hook Stop/SubagentStop: registra custo/uso do agente em cost.txt (raiz do projeto).
// Nunca deve bloquear ou alterar o comportamento do agente — qualquer falha vira
// uma linha de erro no próprio cost.txt e o processo sempre sai com código 0.

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const COST_FILE = path.join(__dirname, '..', '..', 'cost.txt');
const FIELDS = [
  'timestamp',
  'evento',
  'session_id',
  'agente',
  'modelos',
  'custo_usd',
  'tokens_total',
  'tokens_input',
  'tokens_output',
  'tokens_cache_criacao',
  'tokens_cache_leitura',
];

function nowIso() {
  return new Date().toISOString();
}

function ensureHeader() {
  if (!fs.existsSync(COST_FILE)) {
    fs.writeFileSync(COST_FILE, FIELDS.join('|') + '\n', 'utf8');
  }
}

function appendLine(fields) {
  const safe = fields.map((f) => String(f == null ? '' : f).replace(/[\r\n|]+/g, ' '));
  fs.appendFileSync(COST_FILE, safe.join('|') + '\n', 'utf8');
}

function readStdinJson() {
  try {
    const raw = fs.readFileSync(0, 'utf8');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function main() {
  const input = readStdinJson();
  const event = input.hook_event_name || 'desconhecido';
  const sessionId = input.session_id || 'desconhecido';

  ensureHeader();

  try {
    const raw = execFileSync('npx', ['ccusage', 'session', '--json', '--offline'], {
      encoding: 'utf8',
      timeout: 25000,
      windowsHide: true,
      shell: true,
    });
    const data = JSON.parse(raw);
    const sessions = Array.isArray(data.session) ? data.session : [];
    const match = sessions.find((s) => s.period === sessionId);

    if (!match) {
      appendLine([nowIso(), event, sessionId, 'sem_correspondencia']);
      return;
    }

    appendLine([
      nowIso(),
      event,
      sessionId,
      match.agent,
      Array.isArray(match.modelsUsed) ? match.modelsUsed.join(',') : '',
      typeof match.totalCost === 'number' ? match.totalCost.toFixed(6) : '',
      match.totalTokens,
      match.inputTokens,
      match.outputTokens,
      match.cacheCreationTokens,
      match.cacheReadTokens,
    ]);
  } catch (err) {
    const msg = (err && err.message ? err.message : String(err)).slice(0, 300);
    try {
      appendLine([nowIso(), event, sessionId, 'erro_ccusage', msg]);
    } catch {
      // Falha ao gravar não deve derrubar o hook.
    }
  }
}

try {
  main();
} catch {
  // Rede de segurança final: nada aqui pode propagar exceção para o processo do hook.
}
process.exit(0);
