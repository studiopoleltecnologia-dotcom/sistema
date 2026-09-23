export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agendamentos: {
        Row: {
          atualizada_em: string
          canal: Database["public"]["Enums"]["canal_aula"]
          cancelado_em: string | null
          cliente_id: string
          criado_em: string
          data: string
          id: string
          matricula_id: string | null
          origem_cancelamento:
            | Database["public"]["Enums"]["origem_cancelamento"]
            | null
          status: Database["public"]["Enums"]["status_agendamento"]
          turma_id: string
          wellhub_booking_number: string | null
        }
        Insert: {
          atualizada_em?: string
          canal: Database["public"]["Enums"]["canal_aula"]
          cancelado_em?: string | null
          cliente_id: string
          criado_em?: string
          data: string
          id?: string
          matricula_id?: string | null
          origem_cancelamento?:
            | Database["public"]["Enums"]["origem_cancelamento"]
            | null
          status?: Database["public"]["Enums"]["status_agendamento"]
          turma_id: string
          wellhub_booking_number?: string | null
        }
        Update: {
          atualizada_em?: string
          canal?: Database["public"]["Enums"]["canal_aula"]
          cancelado_em?: string | null
          cliente_id?: string
          criado_em?: string
          data?: string
          id?: string
          matricula_id?: string | null
          origem_cancelamento?:
            | Database["public"]["Enums"]["origem_cancelamento"]
            | null
          status?: Database["public"]["Enums"]["status_agendamento"]
          turma_id?: string
          wellhub_booking_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agendamentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_ranking"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "agendamentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_risco"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "agendamentos_matricula_id_fkey"
            columns: ["matricula_id"]
            isOneToOne: false
            referencedRelation: "matriculas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_matricula_id_fkey"
            columns: ["matricula_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_risco"
            referencedColumns: ["matricula_id"]
          },
          {
            foreignKeyName: "agendamentos_matricula_id_fkey"
            columns: ["matricula_id"]
            isOneToOne: false
            referencedRelation: "vw_saldo_creditos"
            referencedColumns: ["matricula_id"]
          },
          {
            foreignKeyName: "agendamentos_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "vw_grade_publica"
            referencedColumns: ["turma_id"]
          },
        ]
      }
      agendamentos_eventos: {
        Row: {
          agendamento_id: string
          criado_em: string
          criado_por: string | null
          detalhe: string | null
          evento: Database["public"]["Enums"]["tipo_evento_agendamento"]
          id: string
        }
        Insert: {
          agendamento_id: string
          criado_em?: string
          criado_por?: string | null
          detalhe?: string | null
          evento: Database["public"]["Enums"]["tipo_evento_agendamento"]
          id?: string
        }
        Update: {
          agendamento_id?: string
          criado_em?: string
          criado_por?: string | null
          detalhe?: string | null
          evento?: Database["public"]["Enums"]["tipo_evento_agendamento"]
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agendamentos_eventos_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_eventos_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "vw_aulas_sem_presenca"
            referencedColumns: ["agendamento_id"]
          },
        ]
      }
      assinaturas_gateway: {
        Row: {
          atualizada_em: string
          checkout_ref: string | null
          cliente_id: string
          criada_em: string
          id: string
          matricula_id: string | null
          provider: string
          provider_ref: string | null
          solicitacao_id: string | null
          status: string
          url_checkout: string | null
        }
        Insert: {
          atualizada_em?: string
          checkout_ref?: string | null
          cliente_id: string
          criada_em?: string
          id?: string
          matricula_id?: string | null
          provider?: string
          provider_ref?: string | null
          solicitacao_id?: string | null
          status?: string
          url_checkout?: string | null
        }
        Update: {
          atualizada_em?: string
          checkout_ref?: string | null
          cliente_id?: string
          criada_em?: string
          id?: string
          matricula_id?: string | null
          provider?: string
          provider_ref?: string | null
          solicitacao_id?: string | null
          status?: string
          url_checkout?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assinaturas_gateway_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assinaturas_gateway_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_ranking"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "assinaturas_gateway_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_risco"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "assinaturas_gateway_matricula_id_fkey"
            columns: ["matricula_id"]
            isOneToOne: false
            referencedRelation: "matriculas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assinaturas_gateway_matricula_id_fkey"
            columns: ["matricula_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_risco"
            referencedColumns: ["matricula_id"]
          },
          {
            foreignKeyName: "assinaturas_gateway_matricula_id_fkey"
            columns: ["matricula_id"]
            isOneToOne: false
            referencedRelation: "vw_saldo_creditos"
            referencedColumns: ["matricula_id"]
          },
          {
            foreignKeyName: "assinaturas_gateway_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "solicitacoes_contratacao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assinaturas_gateway_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "vw_solicitacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      auditoria: {
        Row: {
          acao: string
          antes: Json | null
          autor: string | null
          criado_em: string
          depois: Json | null
          id: string
          motivo: string | null
          registro_id: string | null
          tabela: string
        }
        Insert: {
          acao: string
          antes?: Json | null
          autor?: string | null
          criado_em?: string
          depois?: Json | null
          id?: string
          motivo?: string | null
          registro_id?: string | null
          tabela: string
        }
        Update: {
          acao?: string
          antes?: Json | null
          autor?: string | null
          criado_em?: string
          depois?: Json | null
          id?: string
          motivo?: string | null
          registro_id?: string | null
          tabela?: string
        }
        Relationships: []
      }
      aulas_canceladas: {
        Row: {
          agendamentos_app: number
          agendamentos_cancelados: number
          cancelada_em: string
          cancelada_por: string | null
          creditos_devolvidos: number
          data: string
          fila_encerrada: number
          id: string
          mensagem: string | null
          motivo: Database["public"]["Enums"]["motivo_cancelamento_aula"]
          reaberta_em: string | null
          reaberta_por: string | null
          repor_turma_fixa: boolean
          reposicoes_concedidas: number
          turma_id: string
        }
        Insert: {
          agendamentos_app?: number
          agendamentos_cancelados?: number
          cancelada_em?: string
          cancelada_por?: string | null
          creditos_devolvidos?: number
          data: string
          fila_encerrada?: number
          id?: string
          mensagem?: string | null
          motivo: Database["public"]["Enums"]["motivo_cancelamento_aula"]
          reaberta_em?: string | null
          reaberta_por?: string | null
          repor_turma_fixa?: boolean
          reposicoes_concedidas?: number
          turma_id: string
        }
        Update: {
          agendamentos_app?: number
          agendamentos_cancelados?: number
          cancelada_em?: string
          cancelada_por?: string | null
          creditos_devolvidos?: number
          data?: string
          fila_encerrada?: number
          id?: string
          mensagem?: string | null
          motivo?: Database["public"]["Enums"]["motivo_cancelamento_aula"]
          reaberta_em?: string | null
          reaberta_por?: string | null
          repor_turma_fixa?: boolean
          reposicoes_concedidas?: number
          turma_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "aulas_canceladas_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aulas_canceladas_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "vw_grade_publica"
            referencedColumns: ["turma_id"]
          },
        ]
      }
      categorias_modalidade: {
        Row: {
          ativa: boolean
          cor: string
          cor_fundo: string
          cor_texto: string
          criada_em: string
          id: string
          nome: string
          ordem: number
        }
        Insert: {
          ativa?: boolean
          cor: string
          cor_fundo: string
          cor_texto: string
          criada_em?: string
          id?: string
          nome: string
          ordem?: number
        }
        Update: {
          ativa?: boolean
          cor?: string
          cor_fundo?: string
          cor_texto?: string
          criada_em?: string
          id?: string
          nome?: string
          ordem?: number
        }
        Relationships: []
      }
      categorias_saida: {
        Row: {
          ativa: boolean
          criada_em: string
          id: string
          nome: string
          tipo: Database["public"]["Enums"]["tipo_saida"]
        }
        Insert: {
          ativa?: boolean
          criada_em?: string
          id?: string
          nome: string
          tipo: Database["public"]["Enums"]["tipo_saida"]
        }
        Update: {
          ativa?: boolean
          criada_em?: string
          id?: string
          nome?: string
          tipo?: Database["public"]["Enums"]["tipo_saida"]
        }
        Relationships: []
      }
      checkins_pendentes: {
        Row: {
          cliente_id: string
          data_checkin: string
          evento_externo_id: string | null
          id: string
          momento: string
          observacao: string | null
          presenca_id: string | null
          resolvido_em: string | null
          resolvido_por: string | null
          turma_id: string | null
          turmas_candidatas: string[]
        }
        Insert: {
          cliente_id: string
          data_checkin: string
          evento_externo_id?: string | null
          id?: string
          momento?: string
          observacao?: string | null
          presenca_id?: string | null
          resolvido_em?: string | null
          resolvido_por?: string | null
          turma_id?: string | null
          turmas_candidatas?: string[]
        }
        Update: {
          cliente_id?: string
          data_checkin?: string
          evento_externo_id?: string | null
          id?: string
          momento?: string
          observacao?: string | null
          presenca_id?: string | null
          resolvido_em?: string | null
          resolvido_por?: string | null
          turma_id?: string | null
          turmas_candidatas?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "checkins_pendentes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkins_pendentes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_ranking"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "checkins_pendentes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_risco"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "checkins_pendentes_presenca_id_fkey"
            columns: ["presenca_id"]
            isOneToOne: false
            referencedRelation: "presencas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkins_pendentes_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkins_pendentes_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "vw_grade_publica"
            referencedColumns: ["turma_id"]
          },
        ]
      }
      checklist_execucoes: {
        Row: {
          data: string
          feito_em: string
          feito_por: string | null
          id: string
          item_id: string
        }
        Insert: {
          data?: string
          feito_em?: string
          feito_por?: string | null
          id?: string
          item_id: string
        }
        Update: {
          data?: string
          feito_em?: string
          feito_por?: string | null
          id?: string
          item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_execucoes_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "checklist_itens"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_itens: {
        Row: {
          ativo: boolean
          criada_em: string
          id: string
          ordem: number
          rotina: Database["public"]["Enums"]["rotina_checklist"]
          titulo: string
        }
        Insert: {
          ativo?: boolean
          criada_em?: string
          id?: string
          ordem?: number
          rotina: Database["public"]["Enums"]["rotina_checklist"]
          titulo: string
        }
        Update: {
          ativo?: boolean
          criada_em?: string
          id?: string
          ordem?: number
          rotina?: Database["public"]["Enums"]["rotina_checklist"]
          titulo?: string
        }
        Relationships: []
      }
      clientes: {
        Row: {
          asaas_customer_id: string | null
          atualizada_em: string
          contato_emergencia_nome: string | null
          contato_emergencia_parentesco: string | null
          contato_emergencia_telefone: string | null
          cpf: string | null
          criada_em: string
          data_nascimento: string | null
          email: string | null
          estagio: Database["public"]["Enums"]["estagio_funil"]
          gympass_id: string | null
          id: string
          instagram: string | null
          modalidade: string | null
          nome: string
          observacoes: string | null
          origem: Database["public"]["Enums"]["origem_cliente"]
          primeiro_contato: string
          responsavel_id: string | null
          telefone: string | null
          ultima_aula: string | null
          ultima_conversa: string | null
          vip: boolean
        }
        Insert: {
          asaas_customer_id?: string | null
          atualizada_em?: string
          contato_emergencia_nome?: string | null
          contato_emergencia_parentesco?: string | null
          contato_emergencia_telefone?: string | null
          cpf?: string | null
          criada_em?: string
          data_nascimento?: string | null
          email?: string | null
          estagio?: Database["public"]["Enums"]["estagio_funil"]
          gympass_id?: string | null
          id?: string
          instagram?: string | null
          modalidade?: string | null
          nome: string
          observacoes?: string | null
          origem?: Database["public"]["Enums"]["origem_cliente"]
          primeiro_contato?: string
          responsavel_id?: string | null
          telefone?: string | null
          ultima_aula?: string | null
          ultima_conversa?: string | null
          vip?: boolean
        }
        Update: {
          asaas_customer_id?: string | null
          atualizada_em?: string
          contato_emergencia_nome?: string | null
          contato_emergencia_parentesco?: string | null
          contato_emergencia_telefone?: string | null
          cpf?: string | null
          criada_em?: string
          data_nascimento?: string | null
          email?: string | null
          estagio?: Database["public"]["Enums"]["estagio_funil"]
          gympass_id?: string | null
          id?: string
          instagram?: string | null
          modalidade?: string | null
          nome?: string
          observacoes?: string | null
          origem?: Database["public"]["Enums"]["origem_cliente"]
          primeiro_contato?: string
          responsavel_id?: string | null
          telefone?: string | null
          ultima_aula?: string | null
          ultima_conversa?: string | null
          vip?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "clientes_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "socias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "vw_equipe"
            referencedColumns: ["id"]
          },
        ]
      }
      cobrancas: {
        Row: {
          atualizada_em: string
          ciclo: number | null
          cliente_id: string
          criada_em: string
          descricao: string | null
          forma_pagamento: string | null
          id: string
          matricula_id: string | null
          pago_em: string | null
          provider: string
          provider_ref: string | null
          solicitacao_id: string | null
          status: Database["public"]["Enums"]["status_cobranca"]
          url_pagamento: string | null
          valor_centavos: number
          valor_pago_centavos: number | null
          vencimento: string
        }
        Insert: {
          atualizada_em?: string
          ciclo?: number | null
          cliente_id: string
          criada_em?: string
          descricao?: string | null
          forma_pagamento?: string | null
          id?: string
          matricula_id?: string | null
          pago_em?: string | null
          provider?: string
          provider_ref?: string | null
          solicitacao_id?: string | null
          status?: Database["public"]["Enums"]["status_cobranca"]
          url_pagamento?: string | null
          valor_centavos: number
          valor_pago_centavos?: number | null
          vencimento: string
        }
        Update: {
          atualizada_em?: string
          ciclo?: number | null
          cliente_id?: string
          criada_em?: string
          descricao?: string | null
          forma_pagamento?: string | null
          id?: string
          matricula_id?: string | null
          pago_em?: string | null
          provider?: string
          provider_ref?: string | null
          solicitacao_id?: string | null
          status?: Database["public"]["Enums"]["status_cobranca"]
          url_pagamento?: string | null
          valor_centavos?: number
          valor_pago_centavos?: number | null
          vencimento?: string
        }
        Relationships: [
          {
            foreignKeyName: "cobrancas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobrancas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_ranking"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "cobrancas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_risco"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "cobrancas_matricula_id_fkey"
            columns: ["matricula_id"]
            isOneToOne: false
            referencedRelation: "matriculas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobrancas_matricula_id_fkey"
            columns: ["matricula_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_risco"
            referencedColumns: ["matricula_id"]
          },
          {
            foreignKeyName: "cobrancas_matricula_id_fkey"
            columns: ["matricula_id"]
            isOneToOne: false
            referencedRelation: "vw_saldo_creditos"
            referencedColumns: ["matricula_id"]
          },
          {
            foreignKeyName: "cobrancas_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "solicitacoes_contratacao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobrancas_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "vw_solicitacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      config_agendamento: {
        Row: {
          atualizada_em: string
          dias_antecedencia_cancelamento_plano: number
          dias_antecedencia_cobranca: number
          dias_aviso_fim_compromisso: number
          dias_suspensao_faltas: number
          dias_validade_credito_aula_cancelada: number
          faltas_para_suspensao: number
          horas_cancelamento: number
          id: boolean
          max_reposicoes_por_matricula: number
          minutos_reserva_espera: number
          minutos_tolerancia_atraso: number
          valor_checkin_wellhub_centavos: number
        }
        Insert: {
          atualizada_em?: string
          dias_antecedencia_cancelamento_plano?: number
          dias_antecedencia_cobranca?: number
          dias_aviso_fim_compromisso?: number
          dias_suspensao_faltas?: number
          dias_validade_credito_aula_cancelada?: number
          faltas_para_suspensao?: number
          horas_cancelamento?: number
          id?: boolean
          max_reposicoes_por_matricula?: number
          minutos_reserva_espera?: number
          minutos_tolerancia_atraso?: number
          valor_checkin_wellhub_centavos?: number
        }
        Update: {
          atualizada_em?: string
          dias_antecedencia_cancelamento_plano?: number
          dias_antecedencia_cobranca?: number
          dias_aviso_fim_compromisso?: number
          dias_suspensao_faltas?: number
          dias_validade_credito_aula_cancelada?: number
          faltas_para_suspensao?: number
          horas_cancelamento?: number
          id?: boolean
          max_reposicoes_por_matricula?: number
          minutos_reserva_espera?: number
          minutos_tolerancia_atraso?: number
          valor_checkin_wellhub_centavos?: number
        }
        Relationships: []
      }
      config_financeiro: {
        Row: {
          atualizada_em: string
          id: boolean
          juros_mes_atraso_pct: number
          limite_mei_centavos: number
          meta_faturamento_anual_centavos: number
          meta_faturamento_mensal_centavos: number
          meta_reserva_meses: number
          multa_atraso_pct: number
          percentual_reserva: number
          saldo_inicial_centavos: number
          saldo_inicial_data: string
        }
        Insert: {
          atualizada_em?: string
          id?: boolean
          juros_mes_atraso_pct?: number
          limite_mei_centavos?: number
          meta_faturamento_anual_centavos?: number
          meta_faturamento_mensal_centavos?: number
          meta_reserva_meses?: number
          multa_atraso_pct?: number
          percentual_reserva?: number
          saldo_inicial_centavos?: number
          saldo_inicial_data?: string
        }
        Update: {
          atualizada_em?: string
          id?: boolean
          juros_mes_atraso_pct?: number
          limite_mei_centavos?: number
          meta_faturamento_anual_centavos?: number
          meta_faturamento_mensal_centavos?: number
          meta_reserva_meses?: number
          multa_atraso_pct?: number
          percentual_reserva?: number
          saldo_inicial_centavos?: number
          saldo_inicial_data?: string
        }
        Relationships: []
      }
      contas_aluna: {
        Row: {
          aceite_lgpd_em: string | null
          auth_user_id: string
          cliente_id: string
          criada_em: string
          versao_termo: string | null
        }
        Insert: {
          aceite_lgpd_em?: string | null
          auth_user_id: string
          cliente_id: string
          criada_em?: string
          versao_termo?: string | null
        }
        Update: {
          aceite_lgpd_em?: string | null
          auth_user_id?: string
          cliente_id?: string
          criada_em?: string
          versao_termo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contas_aluna_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: true
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_aluna_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: true
            referencedRelation: "vw_analise_clientes_ranking"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "contas_aluna_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: true
            referencedRelation: "vw_analise_clientes_risco"
            referencedColumns: ["cliente_id"]
          },
        ]
      }
      contas_professora: {
        Row: {
          auth_user_id: string
          criada_em: string
          professora_id: string
        }
        Insert: {
          auth_user_id: string
          criada_em?: string
          professora_id: string
        }
        Update: {
          auth_user_id?: string
          criada_em?: string
          professora_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contas_professora_professora_id_fkey"
            columns: ["professora_id"]
            isOneToOne: true
            referencedRelation: "professoras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_professora_professora_id_fkey"
            columns: ["professora_id"]
            isOneToOne: true
            referencedRelation: "vw_analise_professora"
            referencedColumns: ["professora_id"]
          },
          {
            foreignKeyName: "contas_professora_professora_id_fkey"
            columns: ["professora_id"]
            isOneToOne: true
            referencedRelation: "vw_professoras_nomes"
            referencedColumns: ["id"]
          },
        ]
      }
      creditos_eventos: {
        Row: {
          agendamento_id: string | null
          criado_em: string
          criado_por: string | null
          delta: number
          detalhe: string | null
          id: string
          lote_id: string
          matricula_id: string
          motivo: Database["public"]["Enums"]["motivo_credito"]
        }
        Insert: {
          agendamento_id?: string | null
          criado_em?: string
          criado_por?: string | null
          delta: number
          detalhe?: string | null
          id?: string
          lote_id: string
          matricula_id: string
          motivo: Database["public"]["Enums"]["motivo_credito"]
        }
        Update: {
          agendamento_id?: string | null
          criado_em?: string
          criado_por?: string | null
          delta?: number
          detalhe?: string | null
          id?: string
          lote_id?: string
          matricula_id?: string
          motivo?: Database["public"]["Enums"]["motivo_credito"]
        }
        Relationships: [
          {
            foreignKeyName: "creditos_eventos_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creditos_eventos_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "vw_aulas_sem_presenca"
            referencedColumns: ["agendamento_id"]
          },
          {
            foreignKeyName: "creditos_eventos_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "creditos_lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creditos_eventos_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "vw_creditos_lotes"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "creditos_eventos_matricula_id_fkey"
            columns: ["matricula_id"]
            isOneToOne: false
            referencedRelation: "matriculas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creditos_eventos_matricula_id_fkey"
            columns: ["matricula_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_risco"
            referencedColumns: ["matricula_id"]
          },
          {
            foreignKeyName: "creditos_eventos_matricula_id_fkey"
            columns: ["matricula_id"]
            isOneToOne: false
            referencedRelation: "vw_saldo_creditos"
            referencedColumns: ["matricula_id"]
          },
        ]
      }
      creditos_lotes: {
        Row: {
          aula_cancelada_id: string | null
          ciclo: number
          concedido_em: string
          criado_em: string
          detalhe: string | null
          id: string
          matricula_id: string
          origem: Database["public"]["Enums"]["motivo_credito"]
          quantidade: number
          validade: string
        }
        Insert: {
          aula_cancelada_id?: string | null
          ciclo: number
          concedido_em?: string
          criado_em?: string
          detalhe?: string | null
          id?: string
          matricula_id: string
          origem?: Database["public"]["Enums"]["motivo_credito"]
          quantidade: number
          validade: string
        }
        Update: {
          aula_cancelada_id?: string | null
          ciclo?: number
          concedido_em?: string
          criado_em?: string
          detalhe?: string | null
          id?: string
          matricula_id?: string
          origem?: Database["public"]["Enums"]["motivo_credito"]
          quantidade?: number
          validade?: string
        }
        Relationships: [
          {
            foreignKeyName: "creditos_lotes_aula_cancelada_id_fkey"
            columns: ["aula_cancelada_id"]
            isOneToOne: false
            referencedRelation: "aulas_canceladas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creditos_lotes_matricula_id_fkey"
            columns: ["matricula_id"]
            isOneToOne: false
            referencedRelation: "matriculas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creditos_lotes_matricula_id_fkey"
            columns: ["matricula_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_risco"
            referencedColumns: ["matricula_id"]
          },
          {
            foreignKeyName: "creditos_lotes_matricula_id_fkey"
            columns: ["matricula_id"]
            isOneToOne: false
            referencedRelation: "vw_saldo_creditos"
            referencedColumns: ["matricula_id"]
          },
        ]
      }
      despesas_recorrentes: {
        Row: {
          ativa: boolean
          atualizada_em: string
          categoria_id: string
          criada_em: string
          data_fim: string | null
          data_inicio: string
          descricao: string
          dia_vencimento: number
          id: string
          observacoes: string | null
          valor_centavos: number
        }
        Insert: {
          ativa?: boolean
          atualizada_em?: string
          categoria_id: string
          criada_em?: string
          data_fim?: string | null
          data_inicio?: string
          descricao: string
          dia_vencimento?: number
          id?: string
          observacoes?: string | null
          valor_centavos: number
        }
        Update: {
          ativa?: boolean
          atualizada_em?: string
          categoria_id?: string
          criada_em?: string
          data_fim?: string | null
          data_inicio?: string
          descricao?: string
          dia_vencimento?: number
          id?: string
          observacoes?: string | null
          valor_centavos?: number
        }
        Relationships: [
          {
            foreignKeyName: "despesas_recorrentes_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias_saida"
            referencedColumns: ["id"]
          },
        ]
      }
      dividas: {
        Row: {
          atualizada_em: string
          credor: string
          criada_em: string
          descricao: string | null
          id: string
          quitada: boolean
          valor_centavos: number
        }
        Insert: {
          atualizada_em?: string
          credor: string
          criada_em?: string
          descricao?: string | null
          id?: string
          quitada?: boolean
          valor_centavos: number
        }
        Update: {
          atualizada_em?: string
          credor?: string
          criada_em?: string
          descricao?: string | null
          id?: string
          quitada?: boolean
          valor_centavos?: number
        }
        Relationships: []
      }
      emails_fila: {
        Row: {
          criado_em: string
          dados: Json
          destinatario: string
          enviado_em: string | null
          id: string
          ref: string | null
          status: Database["public"]["Enums"]["status_email"]
          tentativas: number
          tipo: string
          ultimo_erro: string | null
        }
        Insert: {
          criado_em?: string
          dados?: Json
          destinatario: string
          enviado_em?: string | null
          id?: string
          ref?: string | null
          status?: Database["public"]["Enums"]["status_email"]
          tentativas?: number
          tipo: string
          ultimo_erro?: string | null
        }
        Update: {
          criado_em?: string
          dados?: Json
          destinatario?: string
          enviado_em?: string | null
          id?: string
          ref?: string | null
          status?: Database["public"]["Enums"]["status_email"]
          tentativas?: number
          tipo?: string
          ultimo_erro?: string | null
        }
        Relationships: []
      }
      entradas_financeiras: {
        Row: {
          atualizada_em: string
          categoria: Database["public"]["Enums"]["categoria_entrada"]
          ciclo: number | null
          cliente_id: string | null
          criada_em: string
          data_caixa: string | null
          data_competencia: string
          data_prevista: string | null
          descricao: string | null
          id: string
          matricula_id: string | null
          presenca_id: string | null
          status: Database["public"]["Enums"]["status_entrada"]
          valor_centavos: number
        }
        Insert: {
          atualizada_em?: string
          categoria: Database["public"]["Enums"]["categoria_entrada"]
          ciclo?: number | null
          cliente_id?: string | null
          criada_em?: string
          data_caixa?: string | null
          data_competencia?: string
          data_prevista?: string | null
          descricao?: string | null
          id?: string
          matricula_id?: string | null
          presenca_id?: string | null
          status?: Database["public"]["Enums"]["status_entrada"]
          valor_centavos: number
        }
        Update: {
          atualizada_em?: string
          categoria?: Database["public"]["Enums"]["categoria_entrada"]
          ciclo?: number | null
          cliente_id?: string | null
          criada_em?: string
          data_caixa?: string | null
          data_competencia?: string
          data_prevista?: string | null
          descricao?: string | null
          id?: string
          matricula_id?: string | null
          presenca_id?: string | null
          status?: Database["public"]["Enums"]["status_entrada"]
          valor_centavos?: number
        }
        Relationships: [
          {
            foreignKeyName: "entradas_financeiras_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entradas_financeiras_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_ranking"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "entradas_financeiras_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_risco"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "entradas_financeiras_matricula_id_fkey"
            columns: ["matricula_id"]
            isOneToOne: false
            referencedRelation: "matriculas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entradas_financeiras_matricula_id_fkey"
            columns: ["matricula_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_risco"
            referencedColumns: ["matricula_id"]
          },
          {
            foreignKeyName: "entradas_financeiras_matricula_id_fkey"
            columns: ["matricula_id"]
            isOneToOne: false
            referencedRelation: "vw_saldo_creditos"
            referencedColumns: ["matricula_id"]
          },
          {
            foreignKeyName: "entradas_financeiras_presenca_id_fkey"
            columns: ["presenca_id"]
            isOneToOne: false
            referencedRelation: "presencas"
            referencedColumns: ["id"]
          },
        ]
      }
      equipe_convites: {
        Row: {
          criado_em: string
          criado_por: string | null
          email: string
          funcao: Database["public"]["Enums"]["funcao_interna"]
          nome: string
          usado_em: string | null
        }
        Insert: {
          criado_em?: string
          criado_por?: string | null
          email: string
          funcao: Database["public"]["Enums"]["funcao_interna"]
          nome: string
          usado_em?: string | null
        }
        Update: {
          criado_em?: string
          criado_por?: string | null
          email?: string
          funcao?: Database["public"]["Enums"]["funcao_interna"]
          nome?: string
          usado_em?: string | null
        }
        Relationships: []
      }
      fechamento_ajustes: {
        Row: {
          criado_em: string
          criado_por: string | null
          descricao: string | null
          fechamento_id: string
          id: string
          tipo: Database["public"]["Enums"]["tipo_ajuste_folha"]
          valor_centavos: number
        }
        Insert: {
          criado_em?: string
          criado_por?: string | null
          descricao?: string | null
          fechamento_id: string
          id?: string
          tipo?: Database["public"]["Enums"]["tipo_ajuste_folha"]
          valor_centavos: number
        }
        Update: {
          criado_em?: string
          criado_por?: string | null
          descricao?: string | null
          fechamento_id?: string
          id?: string
          tipo?: Database["public"]["Enums"]["tipo_ajuste_folha"]
          valor_centavos?: number
        }
        Relationships: [
          {
            foreignKeyName: "fechamento_ajustes_fechamento_id_fkey"
            columns: ["fechamento_id"]
            isOneToOne: false
            referencedRelation: "fechamentos_professora"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fechamento_ajustes_fechamento_id_fkey"
            columns: ["fechamento_id"]
            isOneToOne: false
            referencedRelation: "vw_fechamento_total"
            referencedColumns: ["fechamento_id"]
          },
        ]
      }
      fechamento_aulas: {
        Row: {
          ajustado_em: string | null
          ajustado_por: string | null
          criado_em: string
          data_aula: string
          fechamento_id: string
          id: string
          motivo_ajuste: string | null
          presentes: number
          regra_id: string | null
          turma_id: string
          valor_ajustado_centavos: number | null
          valor_calculado_centavos: number
        }
        Insert: {
          ajustado_em?: string | null
          ajustado_por?: string | null
          criado_em?: string
          data_aula: string
          fechamento_id: string
          id?: string
          motivo_ajuste?: string | null
          presentes?: number
          regra_id?: string | null
          turma_id: string
          valor_ajustado_centavos?: number | null
          valor_calculado_centavos: number
        }
        Update: {
          ajustado_em?: string | null
          ajustado_por?: string | null
          criado_em?: string
          data_aula?: string
          fechamento_id?: string
          id?: string
          motivo_ajuste?: string | null
          presentes?: number
          regra_id?: string | null
          turma_id?: string
          valor_ajustado_centavos?: number | null
          valor_calculado_centavos?: number
        }
        Relationships: [
          {
            foreignKeyName: "fechamento_aulas_fechamento_id_fkey"
            columns: ["fechamento_id"]
            isOneToOne: false
            referencedRelation: "fechamentos_professora"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fechamento_aulas_fechamento_id_fkey"
            columns: ["fechamento_id"]
            isOneToOne: false
            referencedRelation: "vw_fechamento_total"
            referencedColumns: ["fechamento_id"]
          },
          {
            foreignKeyName: "fechamento_aulas_regra_id_fkey"
            columns: ["regra_id"]
            isOneToOne: false
            referencedRelation: "regras_remuneracao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fechamento_aulas_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fechamento_aulas_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "vw_grade_publica"
            referencedColumns: ["turma_id"]
          },
        ]
      }
      fechamentos_professora: {
        Row: {
          alunas: number | null
          aprovado_em: string | null
          aprovado_por: string | null
          aulas: number | null
          bruto_centavos: number | null
          competencia: string
          criado_em: string
          horas: number | null
          id: string
          observacao: string | null
          professora_id: string
          status: Database["public"]["Enums"]["status_fechamento"]
        }
        Insert: {
          alunas?: number | null
          aprovado_em?: string | null
          aprovado_por?: string | null
          aulas?: number | null
          bruto_centavos?: number | null
          competencia: string
          criado_em?: string
          horas?: number | null
          id?: string
          observacao?: string | null
          professora_id: string
          status?: Database["public"]["Enums"]["status_fechamento"]
        }
        Update: {
          alunas?: number | null
          aprovado_em?: string | null
          aprovado_por?: string | null
          aulas?: number | null
          bruto_centavos?: number | null
          competencia?: string
          criado_em?: string
          horas?: number | null
          id?: string
          observacao?: string | null
          professora_id?: string
          status?: Database["public"]["Enums"]["status_fechamento"]
        }
        Relationships: [
          {
            foreignKeyName: "fechamentos_professora_professora_id_fkey"
            columns: ["professora_id"]
            isOneToOne: false
            referencedRelation: "professoras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fechamentos_professora_professora_id_fkey"
            columns: ["professora_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_professora"
            referencedColumns: ["professora_id"]
          },
          {
            foreignKeyName: "fechamentos_professora_professora_id_fkey"
            columns: ["professora_id"]
            isOneToOne: false
            referencedRelation: "vw_professoras_nomes"
            referencedColumns: ["id"]
          },
        ]
      }
      followup_regras: {
        Row: {
          ativa: boolean
          atualizada_em: string
          dias: number
          tipo: Database["public"]["Enums"]["tipo_followup"]
        }
        Insert: {
          ativa?: boolean
          atualizada_em?: string
          dias: number
          tipo: Database["public"]["Enums"]["tipo_followup"]
        }
        Update: {
          ativa?: boolean
          atualizada_em?: string
          dias?: number
          tipo?: Database["public"]["Enums"]["tipo_followup"]
        }
        Relationships: []
      }
      followups: {
        Row: {
          cliente_id: string
          criado_em: string
          detalhe: string | null
          entrada_id: string | null
          id: string
          resolvido_em: string | null
          resolvido_por: string | null
          status: Database["public"]["Enums"]["status_followup"]
          tipo: Database["public"]["Enums"]["tipo_followup"]
        }
        Insert: {
          cliente_id: string
          criado_em?: string
          detalhe?: string | null
          entrada_id?: string | null
          id?: string
          resolvido_em?: string | null
          resolvido_por?: string | null
          status?: Database["public"]["Enums"]["status_followup"]
          tipo: Database["public"]["Enums"]["tipo_followup"]
        }
        Update: {
          cliente_id?: string
          criado_em?: string
          detalhe?: string | null
          entrada_id?: string | null
          id?: string
          resolvido_em?: string | null
          resolvido_por?: string | null
          status?: Database["public"]["Enums"]["status_followup"]
          tipo?: Database["public"]["Enums"]["tipo_followup"]
        }
        Relationships: [
          {
            foreignKeyName: "followups_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followups_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_ranking"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "followups_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_risco"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "followups_entrada_id_fkey"
            columns: ["entrada_id"]
            isOneToOne: false
            referencedRelation: "entradas_financeiras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followups_entrada_id_fkey"
            columns: ["entrada_id"]
            isOneToOne: false
            referencedRelation: "vw_cobrancas_a_emitir"
            referencedColumns: ["entrada_id"]
          },
          {
            foreignKeyName: "followups_entrada_id_fkey"
            columns: ["entrada_id"]
            isOneToOne: false
            referencedRelation: "vw_contas_a_receber"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followups_resolvido_por_fkey"
            columns: ["resolvido_por"]
            isOneToOne: false
            referencedRelation: "socias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followups_resolvido_por_fkey"
            columns: ["resolvido_por"]
            isOneToOne: false
            referencedRelation: "vw_equipe"
            referencedColumns: ["id"]
          },
        ]
      }
      inscricoes_evento: {
        Row: {
          confirmado_por: string | null
          criado_em: string
          evento: string
          id: string
          nome: string
          nome_acompanhante: string | null
          observacoes: string | null
          pago: boolean
          pago_em: string | null
          telefone: string
          tipo_ingresso: string
          valor_centavos: number
        }
        Insert: {
          confirmado_por?: string | null
          criado_em?: string
          evento?: string
          id?: string
          nome: string
          nome_acompanhante?: string | null
          observacoes?: string | null
          pago?: boolean
          pago_em?: string | null
          telefone: string
          tipo_ingresso: string
          valor_centavos: number
        }
        Update: {
          confirmado_por?: string | null
          criado_em?: string
          evento?: string
          id?: string
          nome?: string
          nome_acompanhante?: string | null
          observacoes?: string | null
          pago?: boolean
          pago_em?: string | null
          telefone?: string
          tipo_ingresso?: string
          valor_centavos?: number
        }
        Relationships: []
      }
      interacoes_crm: {
        Row: {
          cliente_id: string
          criada_em: string
          descricao: string
          id: string
          socia_id: string | null
          tipo: Database["public"]["Enums"]["tipo_interacao"]
        }
        Insert: {
          cliente_id: string
          criada_em?: string
          descricao: string
          id?: string
          socia_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_interacao"]
        }
        Update: {
          cliente_id?: string
          criada_em?: string
          descricao?: string
          id?: string
          socia_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_interacao"]
        }
        Relationships: [
          {
            foreignKeyName: "interacoes_crm_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interacoes_crm_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_ranking"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "interacoes_crm_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_risco"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "interacoes_crm_socia_id_fkey"
            columns: ["socia_id"]
            isOneToOne: false
            referencedRelation: "socias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interacoes_crm_socia_id_fkey"
            columns: ["socia_id"]
            isOneToOne: false
            referencedRelation: "vw_equipe"
            referencedColumns: ["id"]
          },
        ]
      }
      lista_espera: {
        Row: {
          cliente_id: string
          criado_em: string
          data: string
          email_enviado_em: string | null
          id: string
          notificada_em: string | null
          status: Database["public"]["Enums"]["status_lista_espera"]
          turma_id: string
        }
        Insert: {
          cliente_id: string
          criado_em?: string
          data: string
          email_enviado_em?: string | null
          id?: string
          notificada_em?: string | null
          status?: Database["public"]["Enums"]["status_lista_espera"]
          turma_id: string
        }
        Update: {
          cliente_id?: string
          criado_em?: string
          data?: string
          email_enviado_em?: string | null
          id?: string
          notificada_em?: string | null
          status?: Database["public"]["Enums"]["status_lista_espera"]
          turma_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lista_espera_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lista_espera_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_ranking"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "lista_espera_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_risco"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "lista_espera_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lista_espera_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "vw_grade_publica"
            referencedColumns: ["turma_id"]
          },
        ]
      }
      matricula_turmas: {
        Row: {
          criada_em: string
          criada_por: string | null
          fim: string | null
          id: string
          inicio: string
          matricula_id: string
          motivo_saida: string | null
          turma_id: string
        }
        Insert: {
          criada_em?: string
          criada_por?: string | null
          fim?: string | null
          id?: string
          inicio?: string
          matricula_id: string
          motivo_saida?: string | null
          turma_id: string
        }
        Update: {
          criada_em?: string
          criada_por?: string | null
          fim?: string | null
          id?: string
          inicio?: string
          matricula_id?: string
          motivo_saida?: string | null
          turma_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "matricula_turmas_matricula_id_fkey"
            columns: ["matricula_id"]
            isOneToOne: false
            referencedRelation: "matriculas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matricula_turmas_matricula_id_fkey"
            columns: ["matricula_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_risco"
            referencedColumns: ["matricula_id"]
          },
          {
            foreignKeyName: "matricula_turmas_matricula_id_fkey"
            columns: ["matricula_id"]
            isOneToOne: false
            referencedRelation: "vw_saldo_creditos"
            referencedColumns: ["matricula_id"]
          },
          {
            foreignKeyName: "matricula_turmas_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matricula_turmas_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "vw_grade_publica"
            referencedColumns: ["turma_id"]
          },
        ]
      }
      matriculas: {
        Row: {
          atualizada_em: string
          cancelada_em: string | null
          cancelamento_efetivo_em: string | null
          ciclo_atual: number
          ciclo_inicio_contrato: number
          ciclos_compromisso: number
          cliente_id: string
          creditos_total: number
          criada_em: string
          data_fim: string
          data_inicio: string
          dia_renovacao: number
          id: string
          motivo_cancelamento: string | null
          plano_id: string
          preco_contratado_centavos: number
          renova_automaticamente: boolean
          status: Database["public"]["Enums"]["status_matricula"]
        }
        Insert: {
          atualizada_em?: string
          cancelada_em?: string | null
          cancelamento_efetivo_em?: string | null
          ciclo_atual?: number
          ciclo_inicio_contrato?: number
          ciclos_compromisso?: number
          cliente_id: string
          creditos_total: number
          criada_em?: string
          data_fim: string
          data_inicio?: string
          dia_renovacao: number
          id?: string
          motivo_cancelamento?: string | null
          plano_id: string
          preco_contratado_centavos: number
          renova_automaticamente?: boolean
          status?: Database["public"]["Enums"]["status_matricula"]
        }
        Update: {
          atualizada_em?: string
          cancelada_em?: string | null
          cancelamento_efetivo_em?: string | null
          ciclo_atual?: number
          ciclo_inicio_contrato?: number
          ciclos_compromisso?: number
          cliente_id?: string
          creditos_total?: number
          criada_em?: string
          data_fim?: string
          data_inicio?: string
          dia_renovacao?: number
          id?: string
          motivo_cancelamento?: string | null
          plano_id?: string
          preco_contratado_centavos?: number
          renova_automaticamente?: boolean
          status?: Database["public"]["Enums"]["status_matricula"]
        }
        Relationships: [
          {
            foreignKeyName: "matriculas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matriculas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_ranking"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "matriculas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_risco"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "matriculas_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      modalidades: {
        Row: {
          ativa: boolean
          categoria_id: string | null
          criada_em: string
          elegivel_turma_fixa: boolean
          id: string
          nome: string
          ordem: number
          wellhub_class_id: string | null
        }
        Insert: {
          ativa?: boolean
          categoria_id?: string | null
          criada_em?: string
          elegivel_turma_fixa?: boolean
          id?: string
          nome: string
          ordem?: number
          wellhub_class_id?: string | null
        }
        Update: {
          ativa?: boolean
          categoria_id?: string | null
          criada_em?: string
          elegivel_turma_fixa?: boolean
          id?: string
          nome?: string
          ordem?: number
          wellhub_class_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "modalidades_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias_modalidade"
            referencedColumns: ["id"]
          },
        ]
      }
      movimentacoes_funil: {
        Row: {
          cliente_id: string
          estagio_de: Database["public"]["Enums"]["estagio_funil"]
          estagio_para: Database["public"]["Enums"]["estagio_funil"]
          id: string
          motivo: string | null
          ocorreu_em: string
          socia_id: string | null
        }
        Insert: {
          cliente_id: string
          estagio_de: Database["public"]["Enums"]["estagio_funil"]
          estagio_para: Database["public"]["Enums"]["estagio_funil"]
          id?: string
          motivo?: string | null
          ocorreu_em?: string
          socia_id?: string | null
        }
        Update: {
          cliente_id?: string
          estagio_de?: Database["public"]["Enums"]["estagio_funil"]
          estagio_para?: Database["public"]["Enums"]["estagio_funil"]
          id?: string
          motivo?: string | null
          ocorreu_em?: string
          socia_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movimentacoes_funil_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_funil_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_ranking"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "movimentacoes_funil_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_risco"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "movimentacoes_funil_socia_id_fkey"
            columns: ["socia_id"]
            isOneToOne: false
            referencedRelation: "socias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_funil_socia_id_fkey"
            columns: ["socia_id"]
            isOneToOne: false
            referencedRelation: "vw_equipe"
            referencedColumns: ["id"]
          },
        ]
      }
      presencas: {
        Row: {
          agendamento_id: string | null
          atualizada_em: string
          canal: Database["public"]["Enums"]["canal_aula"]
          cliente_id: string
          criado_em: string
          data_aula: string
          id: string
          presente: boolean
          professora_id: string
          turma_id: string
        }
        Insert: {
          agendamento_id?: string | null
          atualizada_em?: string
          canal: Database["public"]["Enums"]["canal_aula"]
          cliente_id: string
          criado_em?: string
          data_aula: string
          id?: string
          presente: boolean
          professora_id: string
          turma_id: string
        }
        Update: {
          agendamento_id?: string | null
          atualizada_em?: string
          canal?: Database["public"]["Enums"]["canal_aula"]
          cliente_id?: string
          criado_em?: string
          data_aula?: string
          id?: string
          presente?: boolean
          professora_id?: string
          turma_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "presencas_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presencas_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "vw_aulas_sem_presenca"
            referencedColumns: ["agendamento_id"]
          },
          {
            foreignKeyName: "presencas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presencas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_ranking"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "presencas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_risco"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "presencas_professora_id_fkey"
            columns: ["professora_id"]
            isOneToOne: false
            referencedRelation: "professoras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presencas_professora_id_fkey"
            columns: ["professora_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_professora"
            referencedColumns: ["professora_id"]
          },
          {
            foreignKeyName: "presencas_professora_id_fkey"
            columns: ["professora_id"]
            isOneToOne: false
            referencedRelation: "vw_professoras_nomes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presencas_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presencas_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "vw_grade_publica"
            referencedColumns: ["turma_id"]
          },
        ]
      }
      produto_modalidades: {
        Row: {
          modalidade_id: string
          produto_id: string
        }
        Insert: {
          modalidade_id: string
          produto_id: string
        }
        Update: {
          modalidade_id?: string
          produto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "produto_modalidades_modalidade_id_fkey"
            columns: ["modalidade_id"]
            isOneToOne: false
            referencedRelation: "modalidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produto_modalidades_modalidade_id_fkey"
            columns: ["modalidade_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_modalidade"
            referencedColumns: ["modalidade_id"]
          },
          {
            foreignKeyName: "produto_modalidades_modalidade_id_fkey"
            columns: ["modalidade_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_professora"
            referencedColumns: ["modalidade_id"]
          },
          {
            foreignKeyName: "produto_modalidades_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      produto_requisitos: {
        Row: {
          criada_em: string
          id: string
          janela_dias: number | null
          parametro_int: number | null
          produto_id: string
          tipo: Database["public"]["Enums"]["tipo_requisito_produto"]
        }
        Insert: {
          criada_em?: string
          id?: string
          janela_dias?: number | null
          parametro_int?: number | null
          produto_id: string
          tipo: Database["public"]["Enums"]["tipo_requisito_produto"]
        }
        Update: {
          criada_em?: string
          id?: string
          janela_dias?: number | null
          parametro_int?: number | null
          produto_id?: string
          tipo?: Database["public"]["Enums"]["tipo_requisito_produto"]
        }
        Relationships: [
          {
            foreignKeyName: "produto_requisitos_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      produtos: {
        Row: {
          acumula_creditos: boolean
          ativo: boolean
          atualizada_em: string
          ciclos_compromisso: number
          convidados_por_ciclo: number
          creditos_por_ciclo: number
          criada_em: string
          desconto_eventos_pct: number
          descricao: string | null
          dias_antecedencia_agendamento: number | null
          gera_credito: boolean
          horas_cancelamento: number | null
          id: string
          limite_por_cliente: number | null
          max_agendamentos_simultaneos: number | null
          nome: string
          ordem: number
          periodicidade_dias: number
          periodicidade_meses: number | null
          preco_centavos: number
          produto_sucessor_id: string | null
          renova_automaticamente: boolean
          status: Database["public"]["Enums"]["status_produto"]
          teto_acumulo_ciclos: number
          tipo_produto: Database["public"]["Enums"]["tipo_produto"]
          turmas_fixas: number
          validade_creditos_dias: number | null
          visivel_no_catalogo: boolean
        }
        Insert: {
          acumula_creditos?: boolean
          ativo?: boolean
          atualizada_em?: string
          ciclos_compromisso?: number
          convidados_por_ciclo?: number
          creditos_por_ciclo: number
          criada_em?: string
          desconto_eventos_pct?: number
          descricao?: string | null
          dias_antecedencia_agendamento?: number | null
          gera_credito?: boolean
          horas_cancelamento?: number | null
          id?: string
          limite_por_cliente?: number | null
          max_agendamentos_simultaneos?: number | null
          nome: string
          ordem?: number
          periodicidade_dias: number
          periodicidade_meses?: number | null
          preco_centavos: number
          produto_sucessor_id?: string | null
          renova_automaticamente?: boolean
          status?: Database["public"]["Enums"]["status_produto"]
          teto_acumulo_ciclos?: number
          tipo_produto?: Database["public"]["Enums"]["tipo_produto"]
          turmas_fixas?: number
          validade_creditos_dias?: number | null
          visivel_no_catalogo?: boolean
        }
        Update: {
          acumula_creditos?: boolean
          ativo?: boolean
          atualizada_em?: string
          ciclos_compromisso?: number
          convidados_por_ciclo?: number
          creditos_por_ciclo?: number
          criada_em?: string
          desconto_eventos_pct?: number
          descricao?: string | null
          dias_antecedencia_agendamento?: number | null
          gera_credito?: boolean
          horas_cancelamento?: number | null
          id?: string
          limite_por_cliente?: number | null
          max_agendamentos_simultaneos?: number | null
          nome?: string
          ordem?: number
          periodicidade_dias?: number
          periodicidade_meses?: number | null
          preco_centavos?: number
          produto_sucessor_id?: string | null
          renova_automaticamente?: boolean
          status?: Database["public"]["Enums"]["status_produto"]
          teto_acumulo_ciclos?: number
          tipo_produto?: Database["public"]["Enums"]["tipo_produto"]
          turmas_fixas?: number
          validade_creditos_dias?: number | null
          visivel_no_catalogo?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "produtos_produto_sucessor_id_fkey"
            columns: ["produto_sucessor_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      professoras: {
        Row: {
          ativa: boolean
          atualizada_em: string
          contato_emergencia_nome: string | null
          contato_emergencia_parentesco: string | null
          contato_emergencia_telefone: string | null
          criada_em: string
          data_nascimento: string | null
          email: string | null
          id: string
          modelo: Database["public"]["Enums"]["modelo_remuneracao"]
          nome: string
          percentual_passagem: number
          piso_uma_aluna_centavos: number
          telefone: string | null
          valor_dia_sem_alunas_centavos: number
          valor_fixo_mes_centavos: number
          valor_hora_centavos: number
          valor_passagem_dia_centavos: number
          valor_por_aluna_centavos: number
        }
        Insert: {
          ativa?: boolean
          atualizada_em?: string
          contato_emergencia_nome?: string | null
          contato_emergencia_parentesco?: string | null
          contato_emergencia_telefone?: string | null
          criada_em?: string
          data_nascimento?: string | null
          email?: string | null
          id?: string
          modelo?: Database["public"]["Enums"]["modelo_remuneracao"]
          nome: string
          percentual_passagem?: number
          piso_uma_aluna_centavos?: number
          telefone?: string | null
          valor_dia_sem_alunas_centavos?: number
          valor_fixo_mes_centavos?: number
          valor_hora_centavos?: number
          valor_passagem_dia_centavos?: number
          valor_por_aluna_centavos: number
        }
        Update: {
          ativa?: boolean
          atualizada_em?: string
          contato_emergencia_nome?: string | null
          contato_emergencia_parentesco?: string | null
          contato_emergencia_telefone?: string | null
          criada_em?: string
          data_nascimento?: string | null
          email?: string | null
          id?: string
          modelo?: Database["public"]["Enums"]["modelo_remuneracao"]
          nome?: string
          percentual_passagem?: number
          piso_uma_aluna_centavos?: number
          telefone?: string | null
          valor_dia_sem_alunas_centavos?: number
          valor_fixo_mes_centavos?: number
          valor_hora_centavos?: number
          valor_passagem_dia_centavos?: number
          valor_por_aluna_centavos?: number
        }
        Relationships: []
      }
      regras_remuneracao: {
        Row: {
          base_percentual: Database["public"]["Enums"]["base_percentual"] | null
          criada_em: string
          criada_por: string | null
          id: string
          modalidade_id: string | null
          observacao: string | null
          percentual: number | null
          piso_centavos: number | null
          professora_id: string | null
          teto_centavos: number | null
          tipo: Database["public"]["Enums"]["tipo_remuneracao"]
          turma_id: string | null
          valor_centavos: number
          valor_sem_alunos_centavos: number
          vigencia_fim: string | null
          vigencia_inicio: string
        }
        Insert: {
          base_percentual?:
            | Database["public"]["Enums"]["base_percentual"]
            | null
          criada_em?: string
          criada_por?: string | null
          id?: string
          modalidade_id?: string | null
          observacao?: string | null
          percentual?: number | null
          piso_centavos?: number | null
          professora_id?: string | null
          teto_centavos?: number | null
          tipo: Database["public"]["Enums"]["tipo_remuneracao"]
          turma_id?: string | null
          valor_centavos?: number
          valor_sem_alunos_centavos?: number
          vigencia_fim?: string | null
          vigencia_inicio: string
        }
        Update: {
          base_percentual?:
            | Database["public"]["Enums"]["base_percentual"]
            | null
          criada_em?: string
          criada_por?: string | null
          id?: string
          modalidade_id?: string | null
          observacao?: string | null
          percentual?: number | null
          piso_centavos?: number | null
          professora_id?: string | null
          teto_centavos?: number | null
          tipo?: Database["public"]["Enums"]["tipo_remuneracao"]
          turma_id?: string | null
          valor_centavos?: number
          valor_sem_alunos_centavos?: number
          vigencia_fim?: string | null
          vigencia_inicio?: string
        }
        Relationships: [
          {
            foreignKeyName: "regras_remuneracao_modalidade_id_fkey"
            columns: ["modalidade_id"]
            isOneToOne: false
            referencedRelation: "modalidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regras_remuneracao_modalidade_id_fkey"
            columns: ["modalidade_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_modalidade"
            referencedColumns: ["modalidade_id"]
          },
          {
            foreignKeyName: "regras_remuneracao_modalidade_id_fkey"
            columns: ["modalidade_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_professora"
            referencedColumns: ["modalidade_id"]
          },
          {
            foreignKeyName: "regras_remuneracao_professora_id_fkey"
            columns: ["professora_id"]
            isOneToOne: false
            referencedRelation: "professoras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regras_remuneracao_professora_id_fkey"
            columns: ["professora_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_professora"
            referencedColumns: ["professora_id"]
          },
          {
            foreignKeyName: "regras_remuneracao_professora_id_fkey"
            columns: ["professora_id"]
            isOneToOne: false
            referencedRelation: "vw_professoras_nomes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regras_remuneracao_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regras_remuneracao_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "vw_grade_publica"
            referencedColumns: ["turma_id"]
          },
        ]
      }
      regras_remuneracao_faixas: {
        Row: {
          id: string
          min_alunos: number
          regra_id: string
          valor_centavos: number
        }
        Insert: {
          id?: string
          min_alunos: number
          regra_id: string
          valor_centavos: number
        }
        Update: {
          id?: string
          min_alunos?: number
          regra_id?: string
          valor_centavos?: number
        }
        Relationships: [
          {
            foreignKeyName: "regras_remuneracao_faixas_regra_id_fkey"
            columns: ["regra_id"]
            isOneToOne: false
            referencedRelation: "regras_remuneracao"
            referencedColumns: ["id"]
          },
        ]
      }
      reserva_movimentos: {
        Row: {
          criada_em: string
          data: string
          id: string
          observacao: string | null
          tipo: Database["public"]["Enums"]["tipo_movimento_reserva"]
          valor_centavos: number
        }
        Insert: {
          criada_em?: string
          data?: string
          id?: string
          observacao?: string | null
          tipo: Database["public"]["Enums"]["tipo_movimento_reserva"]
          valor_centavos: number
        }
        Update: {
          criada_em?: string
          data?: string
          id?: string
          observacao?: string | null
          tipo?: Database["public"]["Enums"]["tipo_movimento_reserva"]
          valor_centavos?: number
        }
        Relationships: []
      }
      saidas_financeiras: {
        Row: {
          atualizada_em: string
          categoria_id: string
          criada_em: string
          data_caixa: string
          data_competencia: string
          data_prevista: string | null
          descricao: string | null
          divida_id: string | null
          fechamento_id: string | null
          id: string
          recorrente_id: string | null
          status_saida: Database["public"]["Enums"]["status_saida"]
          valor_centavos: number
        }
        Insert: {
          atualizada_em?: string
          categoria_id: string
          criada_em?: string
          data_caixa?: string
          data_competencia: string
          data_prevista?: string | null
          descricao?: string | null
          divida_id?: string | null
          fechamento_id?: string | null
          id?: string
          recorrente_id?: string | null
          status_saida?: Database["public"]["Enums"]["status_saida"]
          valor_centavos: number
        }
        Update: {
          atualizada_em?: string
          categoria_id?: string
          criada_em?: string
          data_caixa?: string
          data_competencia?: string
          data_prevista?: string | null
          descricao?: string | null
          divida_id?: string | null
          fechamento_id?: string | null
          id?: string
          recorrente_id?: string | null
          status_saida?: Database["public"]["Enums"]["status_saida"]
          valor_centavos?: number
        }
        Relationships: [
          {
            foreignKeyName: "saidas_financeiras_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias_saida"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saidas_financeiras_divida_id_fkey"
            columns: ["divida_id"]
            isOneToOne: false
            referencedRelation: "dividas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saidas_financeiras_fechamento_id_fkey"
            columns: ["fechamento_id"]
            isOneToOne: false
            referencedRelation: "fechamentos_professora"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saidas_financeiras_fechamento_id_fkey"
            columns: ["fechamento_id"]
            isOneToOne: false
            referencedRelation: "vw_fechamento_total"
            referencedColumns: ["fechamento_id"]
          },
          {
            foreignKeyName: "saidas_financeiras_recorrente_id_fkey"
            columns: ["recorrente_id"]
            isOneToOne: false
            referencedRelation: "despesas_recorrentes"
            referencedColumns: ["id"]
          },
        ]
      }
      salas: {
        Row: {
          ativa: boolean
          criada_em: string
          id: string
          nome: string
          ordem: number
        }
        Insert: {
          ativa?: boolean
          criada_em?: string
          id?: string
          nome: string
          ordem?: number
        }
        Update: {
          ativa?: boolean
          criada_em?: string
          id?: string
          nome?: string
          ordem?: number
        }
        Relationships: []
      }
      socias: {
        Row: {
          criada_em: string
          email: string | null
          funcao: Database["public"]["Enums"]["funcao_interna"]
          id: string
          nome: string
        }
        Insert: {
          criada_em?: string
          email?: string | null
          funcao?: Database["public"]["Enums"]["funcao_interna"]
          id: string
          nome: string
        }
        Update: {
          criada_em?: string
          email?: string | null
          funcao?: Database["public"]["Enums"]["funcao_interna"]
          id?: string
          nome?: string
        }
        Relationships: []
      }
      solicitacoes_cancelamento: {
        Row: {
          ciclo_atual: number
          ciclos_compromisso: number
          cliente_id: string
          data_contratacao: string
          dentro_prazo: boolean
          devolucao_desconto_centavos: number | null
          dias_antecedencia: number
          id: string
          matricula_id: string
          motivo: string | null
          observacao_equipe: string | null
          plano_nome: string
          prazo_limite: string
          produto_id: string
          proxima_renovacao: string
          resolvida_em: string | null
          resolvida_por: string | null
          solicitada_em: string
          solicitada_por: string | null
          status: Database["public"]["Enums"]["status_solicitacao_cancelamento"]
          vigente_ate: string
        }
        Insert: {
          ciclo_atual: number
          ciclos_compromisso: number
          cliente_id: string
          data_contratacao: string
          dentro_prazo: boolean
          devolucao_desconto_centavos?: number | null
          dias_antecedencia: number
          id?: string
          matricula_id: string
          motivo?: string | null
          observacao_equipe?: string | null
          plano_nome: string
          prazo_limite: string
          produto_id: string
          proxima_renovacao: string
          resolvida_em?: string | null
          resolvida_por?: string | null
          solicitada_em?: string
          solicitada_por?: string | null
          status?: Database["public"]["Enums"]["status_solicitacao_cancelamento"]
          vigente_ate: string
        }
        Update: {
          ciclo_atual?: number
          ciclos_compromisso?: number
          cliente_id?: string
          data_contratacao?: string
          dentro_prazo?: boolean
          devolucao_desconto_centavos?: number | null
          dias_antecedencia?: number
          id?: string
          matricula_id?: string
          motivo?: string | null
          observacao_equipe?: string | null
          plano_nome?: string
          prazo_limite?: string
          produto_id?: string
          proxima_renovacao?: string
          resolvida_em?: string | null
          resolvida_por?: string | null
          solicitada_em?: string
          solicitada_por?: string | null
          status?: Database["public"]["Enums"]["status_solicitacao_cancelamento"]
          vigente_ate?: string
        }
        Relationships: [
          {
            foreignKeyName: "solicitacoes_cancelamento_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_cancelamento_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_ranking"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "solicitacoes_cancelamento_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_risco"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "solicitacoes_cancelamento_matricula_id_fkey"
            columns: ["matricula_id"]
            isOneToOne: false
            referencedRelation: "matriculas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_cancelamento_matricula_id_fkey"
            columns: ["matricula_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_risco"
            referencedColumns: ["matricula_id"]
          },
          {
            foreignKeyName: "solicitacoes_cancelamento_matricula_id_fkey"
            columns: ["matricula_id"]
            isOneToOne: false
            referencedRelation: "vw_saldo_creditos"
            referencedColumns: ["matricula_id"]
          },
          {
            foreignKeyName: "solicitacoes_cancelamento_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitacoes_contratacao: {
        Row: {
          atualizada_em: string
          cliente_id: string
          criada_em: string
          decidida_em: string | null
          decidida_por: string | null
          forma_pagamento: string | null
          id: string
          justificativa: string | null
          matricula_id: string | null
          motivo_decisao: string | null
          origem: string
          pago_em: string | null
          preco_centavos: number
          produto_id: string
          solicitada_em: string
          solicitada_por: string | null
          status: Database["public"]["Enums"]["status_solicitacao"]
          turmas: string[]
        }
        Insert: {
          atualizada_em?: string
          cliente_id: string
          criada_em?: string
          decidida_em?: string | null
          decidida_por?: string | null
          forma_pagamento?: string | null
          id?: string
          justificativa?: string | null
          matricula_id?: string | null
          motivo_decisao?: string | null
          origem: string
          pago_em?: string | null
          preco_centavos: number
          produto_id: string
          solicitada_em?: string
          solicitada_por?: string | null
          status?: Database["public"]["Enums"]["status_solicitacao"]
          turmas?: string[]
        }
        Update: {
          atualizada_em?: string
          cliente_id?: string
          criada_em?: string
          decidida_em?: string | null
          decidida_por?: string | null
          forma_pagamento?: string | null
          id?: string
          justificativa?: string | null
          matricula_id?: string | null
          motivo_decisao?: string | null
          origem?: string
          pago_em?: string | null
          preco_centavos?: number
          produto_id?: string
          solicitada_em?: string
          solicitada_por?: string | null
          status?: Database["public"]["Enums"]["status_solicitacao"]
          turmas?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "solicitacoes_contratacao_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_contratacao_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_ranking"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "solicitacoes_contratacao_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_risco"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "solicitacoes_contratacao_matricula_id_fkey"
            columns: ["matricula_id"]
            isOneToOne: false
            referencedRelation: "matriculas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_contratacao_matricula_id_fkey"
            columns: ["matricula_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_risco"
            referencedColumns: ["matricula_id"]
          },
          {
            foreignKeyName: "solicitacoes_contratacao_matricula_id_fkey"
            columns: ["matricula_id"]
            isOneToOne: false
            referencedRelation: "vw_saldo_creditos"
            referencedColumns: ["matricula_id"]
          },
          {
            foreignKeyName: "solicitacoes_contratacao_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      suspensoes_agendamento: {
        Row: {
          cliente_id: string
          criada_em: string
          faltas: number
          fim: string
          id: string
          inicio: string
          matricula_id: string | null
          motivo: string | null
          revogada_em: string | null
          revogada_por: string | null
        }
        Insert: {
          cliente_id: string
          criada_em?: string
          faltas: number
          fim: string
          id?: string
          inicio?: string
          matricula_id?: string | null
          motivo?: string | null
          revogada_em?: string | null
          revogada_por?: string | null
        }
        Update: {
          cliente_id?: string
          criada_em?: string
          faltas?: number
          fim?: string
          id?: string
          inicio?: string
          matricula_id?: string | null
          motivo?: string | null
          revogada_em?: string | null
          revogada_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suspensoes_agendamento_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suspensoes_agendamento_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_ranking"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "suspensoes_agendamento_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_risco"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "suspensoes_agendamento_matricula_id_fkey"
            columns: ["matricula_id"]
            isOneToOne: false
            referencedRelation: "matriculas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suspensoes_agendamento_matricula_id_fkey"
            columns: ["matricula_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_risco"
            referencedColumns: ["matricula_id"]
          },
          {
            foreignKeyName: "suspensoes_agendamento_matricula_id_fkey"
            columns: ["matricula_id"]
            isOneToOne: false
            referencedRelation: "vw_saldo_creditos"
            referencedColumns: ["matricula_id"]
          },
        ]
      }
      tarefas: {
        Row: {
          concluida: boolean
          concluida_em: string | null
          criada_em: string
          criada_por: string | null
          descricao: string | null
          id: string
          prazo: string | null
          responsavel_id: string | null
          titulo: string
        }
        Insert: {
          concluida?: boolean
          concluida_em?: string | null
          criada_em?: string
          criada_por?: string | null
          descricao?: string | null
          id?: string
          prazo?: string | null
          responsavel_id?: string | null
          titulo: string
        }
        Update: {
          concluida?: boolean
          concluida_em?: string | null
          criada_em?: string
          criada_por?: string | null
          descricao?: string | null
          id?: string
          prazo?: string | null
          responsavel_id?: string | null
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarefas_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "socias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefas_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "vw_equipe"
            referencedColumns: ["id"]
          },
        ]
      }
      turmas: {
        Row: {
          ativa: boolean
          atualizada_em: string
          capacidade: number
          criada_em: string
          dia_semana: number
          duracao_minutos: number
          horario: string
          id: string
          modalidade: string
          modalidade_id: string | null
          professora_id: string
          sala_id: string | null
        }
        Insert: {
          ativa?: boolean
          atualizada_em?: string
          capacidade: number
          criada_em?: string
          dia_semana: number
          duracao_minutos?: number
          horario: string
          id?: string
          modalidade?: string
          modalidade_id?: string | null
          professora_id: string
          sala_id?: string | null
        }
        Update: {
          ativa?: boolean
          atualizada_em?: string
          capacidade?: number
          criada_em?: string
          dia_semana?: number
          duracao_minutos?: number
          horario?: string
          id?: string
          modalidade?: string
          modalidade_id?: string | null
          professora_id?: string
          sala_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "turmas_modalidade_id_fkey"
            columns: ["modalidade_id"]
            isOneToOne: false
            referencedRelation: "modalidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turmas_modalidade_id_fkey"
            columns: ["modalidade_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_modalidade"
            referencedColumns: ["modalidade_id"]
          },
          {
            foreignKeyName: "turmas_modalidade_id_fkey"
            columns: ["modalidade_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_professora"
            referencedColumns: ["modalidade_id"]
          },
          {
            foreignKeyName: "turmas_professora_id_fkey"
            columns: ["professora_id"]
            isOneToOne: false
            referencedRelation: "professoras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turmas_professora_id_fkey"
            columns: ["professora_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_professora"
            referencedColumns: ["professora_id"]
          },
          {
            foreignKeyName: "turmas_professora_id_fkey"
            columns: ["professora_id"]
            isOneToOne: false
            referencedRelation: "vw_professoras_nomes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turmas_sala_id_fkey"
            columns: ["sala_id"]
            isOneToOne: false
            referencedRelation: "salas"
            referencedColumns: ["id"]
          },
        ]
      }
      turmas_wellhub_slots: {
        Row: {
          data: string
          id: string
          publicado_em: string
          turma_id: string
          wellhub_slot_id: string
        }
        Insert: {
          data: string
          id?: string
          publicado_em?: string
          turma_id: string
          wellhub_slot_id: string
        }
        Update: {
          data?: string
          id?: string
          publicado_em?: string
          turma_id?: string
          wellhub_slot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "turmas_wellhub_slots_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turmas_wellhub_slots_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "vw_grade_publica"
            referencedColumns: ["turma_id"]
          },
        ]
      }
    }
    Views: {
      vw_alertas: {
        Row: {
          acao_sugerida: string | null
          categoria: string | null
          origem_id: string | null
          origem_tipo: string | null
          severidade: string | null
          texto: string | null
        }
        Relationships: []
      }
      vw_alunas_da_aula: {
        Row: {
          agendamento_id: string | null
          aluna: string | null
          canal: Database["public"]["Enums"]["canal_aula"] | null
          cliente_id: string | null
          data: string | null
          presente: boolean | null
          turma_fixa: boolean | null
          turma_id: string | null
        }
        Relationships: []
      }
      vw_analise_clientes_ranking: {
        Row: {
          aluno_desde: string | null
          aulas_frequentadas: number | null
          ciclos_renovados: number | null
          cliente_id: string | null
          faturamento_centavos: number | null
          matriculas_total: number | null
          nome: string | null
          workshops_eventos: number | null
        }
        Insert: {
          aluno_desde?: never
          aulas_frequentadas?: never
          ciclos_renovados?: never
          cliente_id?: string | null
          faturamento_centavos?: never
          matriculas_total?: never
          nome?: string | null
          workshops_eventos?: never
        }
        Update: {
          aluno_desde?: never
          aulas_frequentadas?: never
          ciclos_renovados?: never
          cliente_id?: string | null
          faturamento_centavos?: never
          matriculas_total?: never
          nome?: string | null
          workshops_eventos?: never
        }
        Relationships: []
      }
      vw_analise_clientes_risco: {
        Row: {
          cliente_id: string | null
          data_fim: string | null
          faltas_atual: number | null
          faltas_recentes: boolean | null
          matricula_id: string | null
          nome: string | null
          plano_id: string | null
          poucos_creditos: boolean | null
          presentes_anterior: number | null
          presentes_atual: number | null
          prioridade: string | null
          queda_frequencia: boolean | null
          saldo_creditos: number | null
          score: number | null
          sem_interacao: boolean | null
          telefone: string | null
          ultima_conversa: string | null
          vencimento_proximo: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "matriculas_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_analise_modalidade: {
        Row: {
          alunas_novas_periodo: number | null
          delta_pp: number | null
          faltas_periodo: number | null
          modalidade: string | null
          modalidade_id: string | null
          ocupacao_anterior_pct: number | null
          ocupacao_atual_pct: number | null
          presentes_periodo: number | null
          taxa_falta_pct: number | null
          tendencia: string | null
          turmas: number | null
        }
        Relationships: []
      }
      vw_analise_professora: {
        Row: {
          alunas_novas_periodo: number | null
          delta_pp: number | null
          faltas_periodo: number | null
          media_modalidade_pct: number | null
          modalidade: string | null
          modalidade_id: string | null
          ocupacao_anterior_pct: number | null
          ocupacao_atual_pct: number | null
          presentes_periodo: number | null
          professora: string | null
          professora_id: string | null
          taxa_falta_pct: number | null
          tendencia: string | null
          turmas: number | null
          vs_modalidade_pp: number | null
        }
        Relationships: []
      }
      vw_analise_resumo: {
        Row: {
          alunos_ativos: number | null
          novos_alunos_periodo: number | null
          taxa_cancelamento_pct: number | null
        }
        Relationships: []
      }
      vw_aulas_sem_presenca: {
        Row: {
          agendamento_id: string | null
          canal: Database["public"]["Enums"]["canal_aula"] | null
          cliente_id: string | null
          cliente_nome: string | null
          data: string | null
          horario: string | null
          modalidade: string | null
          professora_id: string | null
          turma_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agendamentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_ranking"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "agendamentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_risco"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "agendamentos_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "vw_grade_publica"
            referencedColumns: ["turma_id"]
          },
          {
            foreignKeyName: "turmas_professora_id_fkey"
            columns: ["professora_id"]
            isOneToOne: false
            referencedRelation: "professoras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turmas_professora_id_fkey"
            columns: ["professora_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_professora"
            referencedColumns: ["professora_id"]
          },
          {
            foreignKeyName: "turmas_professora_id_fkey"
            columns: ["professora_id"]
            isOneToOne: false
            referencedRelation: "vw_professoras_nomes"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_checkins_pendentes: {
        Row: {
          candidatas: Json | null
          cliente: string | null
          cliente_id: string | null
          data_checkin: string | null
          dia_semana: number | null
          gympass_id: string | null
          id: string | null
          momento: string | null
          motivo: string | null
          turmas_candidatas: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "checkins_pendentes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkins_pendentes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_ranking"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "checkins_pendentes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_risco"
            referencedColumns: ["cliente_id"]
          },
        ]
      }
      vw_cobrancas_a_emitir: {
        Row: {
          asaas_customer_id: string | null
          ciclo: number | null
          cliente_cpf: string | null
          cliente_email: string | null
          cliente_id: string | null
          cliente_nome: string | null
          descricao: string | null
          entrada_id: string | null
          matricula_id: string | null
          valor_centavos: number | null
          vencimento: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entradas_financeiras_matricula_id_fkey"
            columns: ["matricula_id"]
            isOneToOne: false
            referencedRelation: "matriculas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entradas_financeiras_matricula_id_fkey"
            columns: ["matricula_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_risco"
            referencedColumns: ["matricula_id"]
          },
          {
            foreignKeyName: "entradas_financeiras_matricula_id_fkey"
            columns: ["matricula_id"]
            isOneToOne: false
            referencedRelation: "vw_saldo_creditos"
            referencedColumns: ["matricula_id"]
          },
          {
            foreignKeyName: "matriculas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matriculas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_ranking"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "matriculas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_risco"
            referencedColumns: ["cliente_id"]
          },
        ]
      }
      vw_contas_a_pagar: {
        Row: {
          bucket: string | null
          categoria: string | null
          categoria_id: string | null
          competencia: string | null
          descricao: string | null
          divida_id: string | null
          id: string | null
          origem: string | null
          tipo: string | null
          valor_centavos: number | null
          vencimento: string | null
        }
        Relationships: []
      }
      vw_contas_a_receber: {
        Row: {
          bucket: string | null
          categoria: string | null
          competencia: string | null
          descricao: string | null
          id: string | null
          valor_centavos: number | null
          vencimento: string | null
        }
        Insert: {
          bucket?: never
          categoria?: never
          competencia?: string | null
          descricao?: string | null
          id?: string | null
          valor_centavos?: number | null
          vencimento?: never
        }
        Update: {
          bucket?: never
          categoria?: never
          competencia?: string | null
          descricao?: string | null
          id?: string | null
          valor_centavos?: number | null
          vencimento?: never
        }
        Relationships: []
      }
      vw_creditos_lotes: {
        Row: {
          ciclo: number | null
          cliente_id: string | null
          concedido_em: string | null
          detalhe: string | null
          lote_id: string | null
          matricula_id: string | null
          origem: Database["public"]["Enums"]["motivo_credito"] | null
          quantidade: number | null
          saldo: number | null
          validade: string | null
          vencido: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "creditos_lotes_matricula_id_fkey"
            columns: ["matricula_id"]
            isOneToOne: false
            referencedRelation: "matriculas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creditos_lotes_matricula_id_fkey"
            columns: ["matricula_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_risco"
            referencedColumns: ["matricula_id"]
          },
          {
            foreignKeyName: "creditos_lotes_matricula_id_fkey"
            columns: ["matricula_id"]
            isOneToOne: false
            referencedRelation: "vw_saldo_creditos"
            referencedColumns: ["matricula_id"]
          },
          {
            foreignKeyName: "matriculas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matriculas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_ranking"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "matriculas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_risco"
            referencedColumns: ["cliente_id"]
          },
        ]
      }
      vw_dre_competencia: {
        Row: {
          categoria: string | null
          lancamentos: number | null
          mes: string | null
          subtipo: string | null
          tipo: string | null
          total_centavos: number | null
        }
        Relationships: []
      }
      vw_equipe: {
        Row: {
          criada_em: string | null
          email: string | null
          funcao: Database["public"]["Enums"]["funcao_interna"] | null
          id: string | null
          nome: string | null
        }
        Insert: {
          criada_em?: string | null
          email?: string | null
          funcao?: Database["public"]["Enums"]["funcao_interna"] | null
          id?: string | null
          nome?: string | null
        }
        Update: {
          criada_em?: string | null
          email?: string | null
          funcao?: Database["public"]["Enums"]["funcao_interna"] | null
          id?: string | null
          nome?: string | null
        }
        Relationships: []
      }
      vw_fechamento_total: {
        Row: {
          ajustes_centavos: number | null
          alunas_presentes: number | null
          aulas: number | null
          aulas_ajustadas: number | null
          aulas_centavos: number | null
          calculado_centavos: number | null
          competencia: string | null
          fechamento_id: string | null
          professora_id: string | null
          status: Database["public"]["Enums"]["status_fechamento"] | null
          total_centavos: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fechamentos_professora_professora_id_fkey"
            columns: ["professora_id"]
            isOneToOne: false
            referencedRelation: "professoras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fechamentos_professora_professora_id_fkey"
            columns: ["professora_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_professora"
            referencedColumns: ["professora_id"]
          },
          {
            foreignKeyName: "fechamentos_professora_professora_id_fkey"
            columns: ["professora_id"]
            isOneToOne: false
            referencedRelation: "vw_professoras_nomes"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_grade_publica: {
        Row: {
          capacidade: number | null
          categoria_cor: string | null
          categoria_cor_fundo: string | null
          categoria_cor_texto: string | null
          categoria_nome: string | null
          dia_semana: number | null
          duracao_minutos: number | null
          horario: string | null
          modalidade: string | null
          modalidade_id: string | null
          professora_nome: string | null
          sala_nome: string | null
          turma_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "turmas_modalidade_id_fkey"
            columns: ["modalidade_id"]
            isOneToOne: false
            referencedRelation: "modalidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turmas_modalidade_id_fkey"
            columns: ["modalidade_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_modalidade"
            referencedColumns: ["modalidade_id"]
          },
          {
            foreignKeyName: "turmas_modalidade_id_fkey"
            columns: ["modalidade_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_professora"
            referencedColumns: ["modalidade_id"]
          },
        ]
      }
      vw_historico_matricula: {
        Row: {
          autor_nome: string | null
          detalhe: string | null
          id: string | null
          matricula_id: string | null
          quando: string | null
          tipo: string | null
          titulo: string | null
          valor_centavos: number | null
        }
        Relationships: []
      }
      vw_matricula_turmas: {
        Row: {
          capacidade: number | null
          cliente_id: string | null
          dia_semana: number | null
          duracao_minutos: number | null
          fim: string | null
          futuro: boolean | null
          horario: string | null
          inicio: string | null
          matricula_id: string | null
          modalidade: string | null
          modalidade_id: string | null
          motivo_saida: string | null
          professora: string | null
          professora_id: string | null
          sala: string | null
          turma_id: string | null
          vigente: boolean | null
          vinculo_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matricula_turmas_matricula_id_fkey"
            columns: ["matricula_id"]
            isOneToOne: false
            referencedRelation: "matriculas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matricula_turmas_matricula_id_fkey"
            columns: ["matricula_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_risco"
            referencedColumns: ["matricula_id"]
          },
          {
            foreignKeyName: "matricula_turmas_matricula_id_fkey"
            columns: ["matricula_id"]
            isOneToOne: false
            referencedRelation: "vw_saldo_creditos"
            referencedColumns: ["matricula_id"]
          },
          {
            foreignKeyName: "matricula_turmas_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matricula_turmas_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "vw_grade_publica"
            referencedColumns: ["turma_id"]
          },
          {
            foreignKeyName: "matriculas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matriculas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_ranking"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "matriculas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_risco"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "turmas_modalidade_id_fkey"
            columns: ["modalidade_id"]
            isOneToOne: false
            referencedRelation: "modalidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turmas_modalidade_id_fkey"
            columns: ["modalidade_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_modalidade"
            referencedColumns: ["modalidade_id"]
          },
          {
            foreignKeyName: "turmas_modalidade_id_fkey"
            columns: ["modalidade_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_professora"
            referencedColumns: ["modalidade_id"]
          },
          {
            foreignKeyName: "turmas_professora_id_fkey"
            columns: ["professora_id"]
            isOneToOne: false
            referencedRelation: "professoras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turmas_professora_id_fkey"
            columns: ["professora_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_professora"
            referencedColumns: ["professora_id"]
          },
          {
            foreignKeyName: "turmas_professora_id_fkey"
            columns: ["professora_id"]
            isOneToOne: false
            referencedRelation: "vw_professoras_nomes"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_mei_acumulado: {
        Row: {
          falta_para_limite_centavos: number | null
          faturamento_ano_centavos: number | null
          limite_mei_centavos: number | null
          percentual_limite: number | null
          projecao_dezembro_centavos: number | null
        }
        Relationships: []
      }
      vw_mix_receita_mensal: {
        Row: {
          categoria: Database["public"]["Enums"]["categoria_entrada"] | null
          lancamentos: number | null
          mes: string | null
          total_centavos: number | null
        }
        Relationships: []
      }
      vw_mrr: {
        Row: {
          clientes_ativos: number | null
          inadimplentes: number | null
          mrr_centavos: number | null
          mrr_em_risco_centavos: number | null
          mrr_novos_centavos: number | null
          mrr_renovacoes_centavos: number | null
          novos_mes: number | null
          renovacoes_mes: number | null
          ticket_medio_centavos: number | null
        }
        Relationships: []
      }
      vw_ocupacao_turma: {
        Row: {
          capacidade: number | null
          dia_semana: number | null
          horario: string | null
          modalidade: string | null
          ocorrencias: number | null
          ocupacao_pct: number | null
          reservas: number | null
          turma_id: string | null
        }
        Relationships: []
      }
      vw_ocupacao_turma_tendencia: {
        Row: {
          capacidade: number | null
          delta_pp: number | null
          dia_semana: number | null
          horario: string | null
          modalidade: string | null
          modalidade_id: string | null
          ocorrencias_anterior: number | null
          ocorrencias_atual: number | null
          ocupacao_anterior_pct: number | null
          ocupacao_atual_pct: number | null
          professora_id: string | null
          reservas_anterior: number | null
          reservas_atual: number | null
          tendencia: string | null
          turma_id: string | null
        }
        Relationships: []
      }
      vw_pagamento_professoras: {
        Row: {
          alunas_presentes: number | null
          aulas: number | null
          dias: number | null
          horas: number | null
          mes: string | null
          professora: string | null
          professora_id: string | null
          total_centavos: number | null
        }
        Relationships: [
          {
            foreignKeyName: "presencas_professora_id_fkey"
            columns: ["professora_id"]
            isOneToOne: false
            referencedRelation: "professoras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presencas_professora_id_fkey"
            columns: ["professora_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_professora"
            referencedColumns: ["professora_id"]
          },
          {
            foreignKeyName: "presencas_professora_id_fkey"
            columns: ["professora_id"]
            isOneToOne: false
            referencedRelation: "vw_professoras_nomes"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_posicao_fila: {
        Row: {
          cliente_id: string | null
          data: string | null
          id: string | null
          notificada_em: string | null
          posicao: number | null
          status: Database["public"]["Enums"]["status_lista_espera"] | null
          turma_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lista_espera_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lista_espera_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_ranking"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "lista_espera_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_risco"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "lista_espera_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lista_espera_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "vw_grade_publica"
            referencedColumns: ["turma_id"]
          },
        ]
      }
      vw_professoras_nomes: {
        Row: {
          ativa: boolean | null
          id: string | null
          nome: string | null
        }
        Insert: {
          ativa?: boolean | null
          id?: string | null
          nome?: string | null
        }
        Update: {
          ativa?: boolean | null
          id?: string | null
          nome?: string | null
        }
        Relationships: []
      }
      vw_saidas_mensal: {
        Row: {
          lancamentos: number | null
          mes: string | null
          tipo: Database["public"]["Enums"]["tipo_saida"] | null
          total_centavos: number | null
        }
        Relationships: []
      }
      vw_saldo_caixa: {
        Row: {
          previsto_em_aberto_centavos: number | null
          recorrentes_pendentes_mes_centavos: number | null
          saidas_previstas_centavos: number | null
          saldo_atual_centavos: number | null
          saldo_projetado_centavos: number | null
        }
        Relationships: []
      }
      vw_saldo_creditos: {
        Row: {
          cancelamento_efetivo_em: string | null
          ciclo_atual: number | null
          ciclos_compromisso: number | null
          cliente_id: string | null
          creditos_total: number | null
          data_fim: string | null
          data_inicio: string | null
          matricula_id: string | null
          plano_id: string | null
          preco_contratado_centavos: number | null
          proxima_validade: string | null
          renova_automaticamente: boolean | null
          saldo: number | null
          saldo_bruto: number | null
          status: Database["public"]["Enums"]["status_matricula"] | null
        }
        Relationships: [
          {
            foreignKeyName: "matriculas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matriculas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_ranking"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "matriculas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_risco"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "matriculas_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_solicitacoes: {
        Row: {
          cliente_email: string | null
          cliente_id: string | null
          cliente_nome: string | null
          cobranca_id: string | null
          cobranca_status: Database["public"]["Enums"]["status_cobranca"] | null
          cobranca_vencimento: string | null
          decidida_em: string | null
          decisor_nome: string | null
          forma_pagamento: string | null
          id: string | null
          justificativa: string | null
          matricula_id: string | null
          motivo_decisao: string | null
          origem: string | null
          pago_em: string | null
          preco_centavos: number | null
          produto_id: string | null
          produto_nome: string | null
          produto_status: Database["public"]["Enums"]["status_produto"] | null
          solicitada_em: string | null
          solicitante_nome: string | null
          status: Database["public"]["Enums"]["status_solicitacao"] | null
          tipo_produto: Database["public"]["Enums"]["tipo_produto"] | null
          turmas: string[] | null
          url_pagamento: string | null
        }
        Relationships: [
          {
            foreignKeyName: "solicitacoes_contratacao_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_contratacao_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_ranking"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "solicitacoes_contratacao_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_risco"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "solicitacoes_contratacao_matricula_id_fkey"
            columns: ["matricula_id"]
            isOneToOne: false
            referencedRelation: "matriculas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_contratacao_matricula_id_fkey"
            columns: ["matricula_id"]
            isOneToOne: false
            referencedRelation: "vw_analise_clientes_risco"
            referencedColumns: ["matricula_id"]
          },
          {
            foreignKeyName: "solicitacoes_contratacao_matricula_id_fkey"
            columns: ["matricula_id"]
            isOneToOne: false
            referencedRelation: "vw_saldo_creditos"
            referencedColumns: ["matricula_id"]
          },
          {
            foreignKeyName: "solicitacoes_contratacao_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_vagas_turma: {
        Row: {
          data: string | null
          ocupadas: number | null
          turma_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      adicionar_turma_fixa: {
        Args: { p_matricula: string; p_turma: string }
        Returns: string
      }
      agendar_aula: {
        Args: {
          p_canal: Database["public"]["Enums"]["canal_aula"]
          p_cliente: string
          p_data: string
          p_turma: string
        }
        Returns: string
      }
      ajustar_aula_fechamento: {
        Args: { p_aula: string; p_motivo: string; p_valor_centavos: number }
        Returns: undefined
      }
      aprovar_contratacao: {
        Args: { p_motivo?: string; p_solicitacao: string }
        Returns: Database["public"]["Enums"]["status_solicitacao"]
      }
      assentos_fixos_ocupados: {
        Args: { p_data: string; p_turma: string }
        Returns: number
      }
      assinatura_ativada: {
        Args: {
          p_checkout_ref: string
          p_provider: string
          p_provider_ref: string
        }
        Returns: string
      }
      assinatura_encerrada: {
        Args: { p_checkout_ref: string; p_provider: string; p_status: string }
        Returns: string
      }
      avisar_aluno_contratacao: {
        Args: {
          p_cliente: string
          p_dados: Json
          p_ref: string
          p_tipo: string
        }
        Returns: undefined
      }
      avisar_aula_cancelada: {
        Args: { p_cancelamento: string; p_cliente: string; p_dados: Json }
        Returns: undefined
      }
      buscar_aluna: {
        Args: { p_termo: string }
        Returns: {
          id: string
          nome: string
        }[]
      }
      cancelar_agendamento: {
        Args: {
          p_agendamento: string
          p_origem: Database["public"]["Enums"]["origem_cancelamento"]
        }
        Returns: boolean
      }
      cancelar_assinatura: {
        Args: { p_matricula: string; p_motivo?: string }
        Returns: string
      }
      cancelar_aulas: {
        Args: {
          p_data: string
          p_mensagem?: string
          p_motivo: Database["public"]["Enums"]["motivo_cancelamento_aula"]
          p_repor_turma_fixa?: boolean
          p_turmas: string[]
        }
        Returns: number
      }
      cancelar_solicitacao: {
        Args: { p_solicitacao: string }
        Returns: undefined
      }
      cliente_atual: { Args: never; Returns: string }
      cobranca_cancelada: {
        Args: {
          p_estorno?: boolean
          p_provider: string
          p_provider_ref: string
        }
        Returns: string
      }
      cobranca_paga: {
        Args: {
          p_forma: string
          p_pago_em: string
          p_provider: string
          p_provider_ref: string
          p_valor_pago_centavos?: number
        }
        Returns: string
      }
      cobranca_vencida: {
        Args: { p_provider: string; p_provider_ref: string }
        Returns: string
      }
      cobrar_ciclo: {
        Args: { p_ciclo: number; p_matricula: string; p_vencimento: string }
        Returns: string
      }
      conceder_creditos: {
        Args: {
          p_matricula: string
          p_motivo: string
          p_origem?: Database["public"]["Enums"]["motivo_credito"]
          p_quantidade: number
          p_validade?: string
        }
        Returns: string
      }
      conciliar_wellhub: {
        Args: {
          p_data_caixa?: string
          p_mes: string
          p_valor_total_centavos: number
        }
        Returns: number
      }
      confirmar_cancelamento_plano: {
        Args: { p_observacao?: string; p_solicitacao: string }
        Returns: string
      }
      confirmar_pagamento_contratacao: {
        Args: { p_forma?: string; p_pago_em?: string; p_solicitacao: string }
        Returns: string
      }
      confirmar_pagamento_inscricao: {
        Args: {
          p_confirmado: boolean
          p_inscricao: string
          p_observacao?: string
        }
        Returns: undefined
      }
      consumir_credito: {
        Args: {
          p_agendamento?: string
          p_matricula: string
          p_motivo: Database["public"]["Enums"]["motivo_credito"]
          p_para_data?: string
        }
        Returns: string
      }
      convidar_equipe: {
        Args: {
          p_email: string
          p_funcao: Database["public"]["Enums"]["funcao_interna"]
          p_nome: string
        }
        Returns: string
      }
      criar_conta_aluna: {
        Args: {
          p_aceite_lgpd: boolean
          p_contato_emergencia_nome?: string
          p_contato_emergencia_telefone?: string
          p_data_nascimento: string
          p_email: string
          p_nome: string
          p_telefone: string
          p_versao_termo?: string
        }
        Returns: string
      }
      data_renovacao: {
        Args: {
          p_base: string
          p_ciclos: number
          p_dia: number
          p_dias: number
          p_meses: number
        }
        Returns: string
      }
      definir_funcao: {
        Args: {
          p_funcao: Database["public"]["Enums"]["funcao_interna"]
          p_id: string
        }
        Returns: undefined
      }
      desfazer_ajuste_aula: { Args: { p_aula: string }; Returns: undefined }
      devolver_credito: {
        Args: {
          p_agendamento?: string
          p_lote: string
          p_matricula: string
          p_motivo: Database["public"]["Enums"]["motivo_credito"]
        }
        Returns: string
      }
      disparar_cobrancas: { Args: never; Returns: undefined }
      disparar_emails: { Args: never; Returns: undefined }
      disparar_publicacao_grade_wellhub: { Args: never; Returns: undefined }
      elegivel_para_produto: {
        Args: { p_cliente: string; p_produto: string }
        Returns: {
          motivo: string
          ok: boolean
        }[]
      }
      emails_gestao: { Args: never; Returns: string[] }
      encerrar_turma_fixa: {
        Args: { p_imediato?: boolean; p_motivo?: string; p_vinculo: string }
        Returns: string
      }
      enfileirar_email: {
        Args: {
          p_dados?: Json
          p_destinatario: string
          p_ref?: string
          p_tipo: string
        }
        Returns: undefined
      }
      enfileirar_lembretes_aula: { Args: never; Returns: number }
      enfileirar_vencimentos: { Args: never; Returns: number }
      entrar_lista_espera: {
        Args: { p_data: string; p_turma: string }
        Returns: string
      }
      faltas_no_ciclo: { Args: { p_matricula: string }; Returns: number }
      fn_analise_clientes_sumidos: {
        Args: { p_dias?: number }
        Returns: {
          cliente_id: string
          data_fim: string
          dias_sem_aula: number
          matricula_id: string
          nome: string
          plano_id: string
          saldo_creditos: number
          telefone: string
          ultima_aula: string
        }[]
      }
      fn_evolucao_semanal: {
        Args: { p_semanas?: number }
        Returns: {
          cancelamentos: number
          faltas: number
          novos_alunos: number
          ocupacao_pct: number
          presentes: number
          semana_fim: string
          semana_inicio: string
        }[]
      }
      fn_ocupacao_turma: {
        Args: { p_fim: string; p_inicio: string }
        Returns: {
          capacidade: number
          dia_semana: number
          horario: string
          modalidade: string
          modalidade_id: string
          ocorrencias: number
          ocupacao_pct: number
          professora_id: string
          reservas: number
          turma_id: string
        }[]
      }
      gerar_followups: { Args: never; Returns: number }
      impedimento_para_contratar: {
        Args: { p_cliente: string; p_produto: string }
        Returns: {
          excepcionavel: boolean
          motivo: string
        }[]
      }
      is_cliente: { Args: never; Returns: boolean }
      is_gestao: { Args: never; Returns: boolean }
      is_operacional: { Args: never; Returns: boolean }
      is_professora: { Args: never; Returns: boolean }
      is_socia: { Args: never; Returns: boolean }
      marcar_inadimplente: { Args: { p_matricula: string }; Returns: boolean }
      matricular: {
        Args: { p_cliente: string; p_justificativa?: string; p_plano: string }
        Returns: string
      }
      matricular_produto: {
        Args: { p_cliente: string; p_justificativa?: string; p_plano: string }
        Returns: string
      }
      matricular_turma_fixa: {
        Args: {
          p_cliente: string
          p_justificativa?: string
          p_produto: string
          p_turmas: string[]
        }
        Returns: string
      }
      meu_cadastro_previo: {
        Args: never
        Returns: {
          contato_emergencia_nome: string
          contato_emergencia_telefone: string
          data_nascimento: string
          nome: string
          telefone: string
        }[]
      }
      meus_planos: {
        Args: never
        Returns: {
          acumula_creditos: boolean
          cancelada_em: string
          cancelamento_efetivo_em: string
          ciclo_atual: number
          ciclos_compromisso: number
          ciclos_utilizados_se_cancelar: number
          convidados_por_ciclo: number
          creditos_por_ciclo: number
          creditos_usados_ciclo: number
          data_contratacao: string
          data_fim: string
          data_inicio: string
          dentro_prazo_cancelamento: boolean
          desconto_eventos_pct: number
          devolucao_desconto_centavos: number
          dia_renovacao: number
          dias_antecedencia_agendamento: number
          dias_antecedencia_cancelamento: number
          fim_compromisso: string
          gera_credito: boolean
          horas_cancelamento: number
          matricula_id: string
          max_agendamentos_simultaneos: number
          modalidades: string[]
          pagamento_pendente_desde: string
          periodicidade_dias: number
          periodicidade_meses: number
          plano_nome: string
          prazo_cancelamento: string
          preco_centavos: number
          produto_id: string
          proxima_renovacao: string
          proxima_validade: string
          proximo_plano_nome: string
          proximo_plano_preco_centavos: number
          renova_automaticamente: boolean
          saida_antecipada: boolean
          saldo: number
          solicitacao_dentro_prazo: boolean
          solicitacao_devolucao_centavos: number
          solicitacao_em: string
          solicitacao_id: string
          solicitacao_motivo: string
          solicitacao_prazo_limite: string
          solicitacao_proxima_renovacao: string
          solicitacao_status: Database["public"]["Enums"]["status_solicitacao_cancelamento"]
          solicitacao_vigente_ate: string
          status: Database["public"]["Enums"]["status_matricula"]
          teto_acumulo_ciclos: number
          tipo_produto: Database["public"]["Enums"]["tipo_produto"]
          turmas_fixas: number
          vigente_ate_se_cancelar: string
        }[]
      }
      minha_funcao: {
        Args: never
        Returns: Database["public"]["Enums"]["funcao_interna"]
      }
      montar_fechamento: {
        Args: { p_competencia: string; p_professora: string }
        Returns: number
      }
      previa_cancelamento_aulas: {
        Args: { p_data: string; p_turmas: string[] }
        Returns: {
          agendados: number
          ja_cancelada: boolean
          na_fila: number
          pelo_app: number
          turma_fixa: number
          turma_id: string
        }[]
      }
      processar_assinaturas: { Args: never; Returns: Json }
      processar_listas_espera: { Args: never; Returns: number }
      professora_atual: { Args: never; Returns: string }
      promover_lista_espera: {
        Args: { p_data: string; p_turma: string }
        Returns: string
      }
      reabrir_aula: { Args: { p_cancelamento: string }; Returns: undefined }
      recusar_contratacao: {
        Args: { p_motivo: string; p_solicitacao: string }
        Returns: undefined
      }
      registrar_assinatura_gateway: {
        Args: {
          p_checkout_ref: string
          p_cliente: string
          p_matricula: string
          p_provider: string
          p_solicitacao: string
          p_url: string
        }
        Returns: string
      }
      registrar_checkin_wellhub: {
        Args: {
          p_cliente: string
          p_evento_externo?: string
          p_momento?: string
        }
        Returns: Json
      }
      registrar_cobranca: {
        Args: {
          p_ciclo: number
          p_cliente: string
          p_descricao: string
          p_matricula: string
          p_provider: string
          p_provider_ref: string
          p_solicitacao: string
          p_url: string
          p_valor_centavos: number
          p_vencimento: string
        }
        Returns: string
      }
      registrar_cobranca_de_assinatura: {
        Args: {
          p_assinatura_ref: string
          p_descricao: string
          p_provider: string
          p_provider_ref: string
          p_valor_centavos: number
          p_vencimento: string
        }
        Returns: string
      }
      registrar_presenca: {
        Args: {
          p_canal?: Database["public"]["Enums"]["canal_aula"]
          p_cliente: string
          p_data: string
          p_presente: boolean
          p_turma: string
        }
        Returns: string
      }
      regras_cancelamento_plano: {
        Args: { p_em?: string; p_matricula: string }
        Returns: {
          ciclos_utilizados: number
          dentro_prazo: boolean
          devolucao_desconto_centavos: number
          dias_antecedencia: number
          fim_compromisso: string
          prazo_limite: string
          proxima_renovacao: string
          proximo_plano_nome: string
          proximo_plano_preco_centavos: number
          renova: boolean
          saida_antecipada: boolean
          vigente_ate: string
        }[]
      }
      remover_acesso: { Args: { p_id: string }; Returns: undefined }
      renovar_ciclo: { Args: { p_matricula: string }; Returns: number }
      resolver_checkin_pendente: {
        Args: { p_observacao?: string; p_pendencia: string; p_turma: string }
        Returns: string
      }
      resolver_regra_remuneracao: {
        Args: { p_data: string; p_professora: string; p_turma: string }
        Returns: string
      }
      retirar_solicitacao_cancelamento: {
        Args: { p_observacao?: string; p_solicitacao: string }
        Returns: undefined
      }
      revogar_suspensao: {
        Args: { p_motivo?: string; p_suspensao: string }
        Returns: boolean
      }
      rotulo_motivo_cancelamento_aula: {
        Args: { p: Database["public"]["Enums"]["motivo_cancelamento_aula"] }
        Returns: string
      }
      sair_lista_espera: { Args: { p_id: string }; Returns: boolean }
      saldo_disponivel: {
        Args: { p_matricula: string; p_para_data?: string }
        Returns: number
      }
      solicitar_cancelamento_plano: {
        Args: { p_matricula: string; p_motivo?: string }
        Returns: string
      }
      solicitar_contratacao: {
        Args: {
          p_cliente: string
          p_justificativa?: string
          p_produto: string
          p_turmas?: string[]
        }
        Returns: string
      }
      suspensao_vigente: { Args: { p_cliente: string }; Returns: string }
      tem_assento_fixo: {
        Args: { p_cliente: string; p_data: string; p_turma: string }
        Returns: boolean
      }
      trocar_turma_fixa: {
        Args: { p_imediato?: boolean; p_turma_nova: string; p_vinculo: string }
        Returns: string
      }
      validar_assento_fixo: {
        Args: { p_data: string; p_turma: string }
        Returns: undefined
      }
      valor_da_aula: {
        Args: {
          p_data: string
          p_duracao_minutos?: number
          p_presentes: number
          p_professora: string
          p_turma: string
        }
        Returns: number
      }
    }
    Enums: {
      base_percentual: "mensalidade_contratada"
      canal_aula: "mensalista" | "wellhub" | "classpass" | "avulsa"
      categoria_entrada:
        | "mensalista"
        | "wellhub"
        | "classpass"
        | "avulsa"
        | "workshop"
        | "evento"
        | "outros"
      estagio_funil:
        | "lead"
        | "pediu_informacoes"
        | "agendou_experimental"
        | "fez_experimental"
        | "ativa"
        | "inativa"
        | "em_retorno"
        | "ex_aluna"
      funcao_interna: "gestao" | "secretaria" | "social"
      modelo_remuneracao: "por_aluna" | "por_hora" | "fixo"
      motivo_cancelamento_aula:
        | "professora"
        | "estudio"
        | "cidade"
        | "feriado"
        | "quorum"
        | "outro"
      motivo_credito:
        | "compra"
        | "agendamento"
        | "cancelamento"
        | "reposicao"
        | "ajuste"
        | "expiracao"
      origem_cancelamento: "aluna" | "socia" | "professora" | "sistema"
      origem_cliente:
        | "whatsapp"
        | "instagram"
        | "wellhub"
        | "classpass"
        | "indicacao"
        | "passou_na_porta"
        | "outros"
        | "portal_aluna"
      plano_tipo: "creditos" | "semanal"
      rotina_checklist: "abertura" | "fechamento"
      status_agendamento: "agendado" | "cancelado"
      status_cobranca:
        | "pendente"
        | "paga"
        | "vencida"
        | "cancelada"
        | "estornada"
      status_email: "pendente" | "enviado" | "erro"
      status_entrada: "prevista" | "recebida" | "cancelada"
      status_fechamento: "aberto" | "aprovado"
      status_followup: "pendente" | "concluido" | "dispensado"
      status_lista_espera:
        | "aguardando"
        | "notificada"
        | "expirada"
        | "confirmada"
        | "cancelada"
      status_matricula: "ativa" | "pausada" | "cancelada" | "inadimplente"
      status_produto: "venda" | "interno" | "legado" | "arquivado"
      status_saida: "prevista" | "paga" | "cancelada"
      status_solicitacao:
        | "aguardando_aprovacao"
        | "aguardando_pagamento"
        | "concluida"
        | "recusada"
        | "cancelada"
      status_solicitacao_cancelamento: "pendente" | "confirmada" | "retirada"
      tipo_ajuste_folha:
        | "bonus"
        | "desconto"
        | "falta"
        | "substituicao"
        | "reposicao"
        | "passagem"
        | "workshop"
        | "outro"
      tipo_evento_agendamento: "agendado" | "cancelado" | "presenca" | "falta"
      tipo_followup:
        | "lead_sumido"
        | "experimental_sem_retorno"
        | "cliente_inativa"
        | "aniversario"
        | "vencimento_plano"
      tipo_interacao: "nota" | "whatsapp" | "conversa" | "mudanca_estagio"
      tipo_movimento_reserva: "aporte" | "retirada"
      tipo_produto: "plano" | "pacote" | "servico"
      tipo_remuneracao:
        | "por_aluna"
        | "por_hora"
        | "fixo_aula"
        | "fixo_mes"
        | "percentual"
      tipo_requisito_produto:
        | "nunca_treinou"
        | "plano_ativo"
        | "checkins_wellhub"
      tipo_saida: "fixa" | "variavel" | "fixa_planejada"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      base_percentual: ["mensalidade_contratada"],
      canal_aula: ["mensalista", "wellhub", "classpass", "avulsa"],
      categoria_entrada: [
        "mensalista",
        "wellhub",
        "classpass",
        "avulsa",
        "workshop",
        "evento",
        "outros",
      ],
      estagio_funil: [
        "lead",
        "pediu_informacoes",
        "agendou_experimental",
        "fez_experimental",
        "ativa",
        "inativa",
        "em_retorno",
        "ex_aluna",
      ],
      funcao_interna: ["gestao", "secretaria", "social"],
      modelo_remuneracao: ["por_aluna", "por_hora", "fixo"],
      motivo_cancelamento_aula: [
        "professora",
        "estudio",
        "cidade",
        "feriado",
        "quorum",
        "outro",
      ],
      motivo_credito: [
        "compra",
        "agendamento",
        "cancelamento",
        "reposicao",
        "ajuste",
        "expiracao",
      ],
      origem_cancelamento: ["aluna", "socia", "professora", "sistema"],
      origem_cliente: [
        "whatsapp",
        "instagram",
        "wellhub",
        "classpass",
        "indicacao",
        "passou_na_porta",
        "outros",
        "portal_aluna",
      ],
      plano_tipo: ["creditos", "semanal"],
      rotina_checklist: ["abertura", "fechamento"],
      status_agendamento: ["agendado", "cancelado"],
      status_cobranca: [
        "pendente",
        "paga",
        "vencida",
        "cancelada",
        "estornada",
      ],
      status_email: ["pendente", "enviado", "erro"],
      status_entrada: ["prevista", "recebida", "cancelada"],
      status_fechamento: ["aberto", "aprovado"],
      status_followup: ["pendente", "concluido", "dispensado"],
      status_lista_espera: [
        "aguardando",
        "notificada",
        "expirada",
        "confirmada",
        "cancelada",
      ],
      status_matricula: ["ativa", "pausada", "cancelada", "inadimplente"],
      status_produto: ["venda", "interno", "legado", "arquivado"],
      status_saida: ["prevista", "paga", "cancelada"],
      status_solicitacao: [
        "aguardando_aprovacao",
        "aguardando_pagamento",
        "concluida",
        "recusada",
        "cancelada",
      ],
      status_solicitacao_cancelamento: ["pendente", "confirmada", "retirada"],
      tipo_ajuste_folha: [
        "bonus",
        "desconto",
        "falta",
        "substituicao",
        "reposicao",
        "passagem",
        "workshop",
        "outro",
      ],
      tipo_evento_agendamento: ["agendado", "cancelado", "presenca", "falta"],
      tipo_followup: [
        "lead_sumido",
        "experimental_sem_retorno",
        "cliente_inativa",
        "aniversario",
        "vencimento_plano",
      ],
      tipo_interacao: ["nota", "whatsapp", "conversa", "mudanca_estagio"],
      tipo_movimento_reserva: ["aporte", "retirada"],
      tipo_produto: ["plano", "pacote", "servico"],
      tipo_remuneracao: [
        "por_aluna",
        "por_hora",
        "fixo_aula",
        "fixo_mes",
        "percentual",
      ],
      tipo_requisito_produto: [
        "nunca_treinou",
        "plano_ativo",
        "checkins_wellhub",
      ],
      tipo_saida: ["fixa", "variavel", "fixa_planejada"],
    },
  },
} as const
