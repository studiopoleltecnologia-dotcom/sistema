import { useEffect, useRef, useState } from 'react'
import { Bell, Check, Settings2 } from 'lucide-react'
import { cn } from '../../../components/ui/cn'
import { fmtDataHora } from '../../../lib/datas'
import {
  useMarcarLida,
  useMarcarTodasLidas,
  useNaoLidas,
  useNotificacoes,
} from '../hooks/useNotificacoes'
import { PreferenciasNotificacao } from './PreferenciasNotificacao'

/**
 * O sino da equipe (bloco 12).
 *
 * O ERP tem cinco filas que esperam resposta — contratação, pedido de
 * cancelamento, pausa, convidado, aula cancelada por quórum — e até
 * agora a única forma de saber que havia algo era abrir tela por tela,
 * ou ler o e-mail. Quem abre o sistema de manhã precisa ver o que está
 * parado sem procurar.
 *
 * Três decisões de desenho:
 *
 * * **o clique leva para a tela, e lê a notificação no caminho.** O sino
 *   não tenta contar a história: ele diz o que é e abre o lugar onde a
 *   ação acontece. Detalhe em dropdown é detalhe que ninguém usa.
 * * **"marcar todas como lidas" existe** porque notificação que não
 *   zera vira um número vermelho permanente, e número vermelho
 *   permanente deixa de ser visto.
 * * **a engrenagem fica aqui dentro**, não num menu de configurações. É
 *   onde a pessoa está quando pensa "não quero mais isso por e-mail".
 */
export function Sino() {
  const [aberto, setAberto] = useState(false)
  const [preferencias, setPreferencias] = useState(false)
  const { data: naoLidas } = useNaoLidas()
  const { data: itens, isLoading } = useNotificacoes(aberto)
  const marcar = useMarcarLida()
  const todas = useMarcarTodasLidas()
  const caixa = useRef<HTMLDivElement>(null)

  // Fecha ao clicar fora e no Esc: é um painel sobreposto, e ficar preso
  // nele num sistema que se usa com uma mão só na recepção é atrito.
  useEffect(() => {
    if (!aberto) return
    function fora(e: MouseEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false)
    }
    function esc(e: KeyboardEvent) {
      if (e.key === 'Escape') setAberto(false)
    }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', fora)
      document.removeEventListener('keydown', esc)
    }
  }, [aberto])

  const n = naoLidas ?? 0

  return (
    <div className="relative ml-auto" ref={caixa}>
      <button
        onClick={() => setAberto((v) => !v)}
        aria-label={n > 0 ? `Avisos (${n} não lidos)` : 'Avisos'}
        className="relative rounded-md p-1.5 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800"
      >
        <Bell className="size-5" />
        {n > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-danger-600 px-1 text-[10px] font-bold leading-4 text-white">
            {n > 9 ? '9+' : n}
          </span>
        )}
      </button>

      {aberto && (
        <div className="absolute right-0 top-11 z-40 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg">
          <header className="flex items-center gap-2 border-b border-neutral-100 px-3 py-2">
            <h2 className="font-display text-sm font-bold text-neutral-900">Avisos</h2>
            <div className="ml-auto flex items-center gap-0.5">
              {n > 0 && (
                <button
                  onClick={() => todas.mutate()}
                  disabled={todas.isPending}
                  title="Marcar todos como lidos"
                  className="rounded-md p-1.5 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
                >
                  <Check className="size-4" />
                </button>
              )}
              <button
                onClick={() => {
                  setPreferencias(true)
                  setAberto(false)
                }}
                title="O que eu quero receber"
                className="rounded-md p-1.5 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
              >
                <Settings2 className="size-4" />
              </button>
            </div>
          </header>

          <div className="max-h-[70vh] overflow-y-auto">
            {isLoading && <p className="px-3 py-6 text-center text-sm text-neutral-400">Carregando…</p>}

            {!isLoading && (itens?.length ?? 0) === 0 && (
              <p className="px-3 py-8 text-center text-sm leading-relaxed text-neutral-400">
                Nada esperando você.
                <span className="mt-1 block text-xs">
                  Pedidos de plano, pausa, convidado e aulas canceladas aparecem aqui.
                </span>
              </p>
            )}

            {(itens ?? []).map((i) => {
              const lida = Boolean(i.lida_em)
              return (
                <a
                  key={i.id}
                  href={i.link ?? undefined}
                  onClick={() => {
                    if (!lida) marcar.mutate(i.id)
                    setAberto(false)
                  }}
                  className={cn(
                    'flex gap-2.5 border-b border-neutral-100 px-3 py-2.5 transition last:border-0 hover:bg-neutral-50',
                    i.link ? 'cursor-pointer' : 'cursor-default',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'mt-1.5 size-1.5 shrink-0 rounded-full',
                      lida ? 'bg-transparent' : 'bg-brand-500',
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'block text-sm leading-snug',
                        lida ? 'text-neutral-500' : 'font-medium text-neutral-900',
                      )}
                    >
                      {i.titulo}
                    </span>
                    {i.descricao && (
                      <span className="mt-0.5 block truncate text-xs text-neutral-500">
                        {i.descricao}
                      </span>
                    )}
                    <span className="mt-0.5 block text-[11px] text-neutral-400">
                      {fmtDataHora(i.criada_em)}
                    </span>
                  </span>
                </a>
              )
            })}
          </div>
        </div>
      )}

      {preferencias && <PreferenciasNotificacao onFechar={() => setPreferencias(false)} />}
    </div>
  )
}
