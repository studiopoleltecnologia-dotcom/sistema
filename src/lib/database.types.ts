/**
 * Tipos gerados do schema Supabase (mcp__supabase__generate_typescript_types).
 * NÃO editar à mão — regenerar após cada migration (CLAUDE.md seção 7).
 */
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
          cancelado_em: string | null
          canal: Database["public"]["Enums"]["canal_aula"]
          cliente_id: string
          criado_em: string
          data: string
          id: string
          matricula_id: string | null
          origem_cancelamento: Database["public"]["Enums"]["origem_cancelamento"] | null
          status: Database["public"]["Enums"]["status_agendamento"]
          turma_id: string
        }
        Insert: {
          atualizada_em?: string
          cancelado_em?: string | null
          canal: Database["public"]["Enums"]["canal_aula"]
          cliente_id: string
          criado_em?: string
          data: string
          id?: string
          matricula_id?: string | null
          origem_cancelamento?: Database["public"]["Enums"]["origem_cancelamento"] | null
          status?: Database["public"]["Enums"]["status_agendamento"]
          turma_id: string
        }
        Update: {
          atualizada_em?: string
          cancelado_em?: string | null
          canal?: Database["public"]["Enums"]["canal_aula"]
          cliente_id?: string
          criado_em?: string
          data?: string
          id?: string
          matricula_id?: string | null
          origem_cancelamento?: Database["public"]["Enums"]["origem_cancelamento"] | null
          status?: Database["public"]["Enums"]["status_agendamento"]
          turma_id?: string
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
            foreignKeyName: "agendamentos_matricula_id_fkey"
            columns: ["matricula_id"]
            isOneToOne: false
            referencedRelation: "matriculas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
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
            foreignKeyName: "agendamentos_eventos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "socias"
            referencedColumns: ["id"]
          },
        ]
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
      clientes: {
        Row: {
          atualizada_em: string
          criada_em: string
          data_nascimento: string | null
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
          atualizada_em?: string
          criada_em?: string
          data_nascimento?: string | null
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
          atualizada_em?: string
          criada_em?: string
          data_nascimento?: string | null
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
        ]
      }
      config_agendamento: {
        Row: {
          atualizada_em: string
          horas_cancelamento: number
          id: boolean
          max_reposicoes_por_matricula: number
          valor_checkin_wellhub_centavos: number
        }
        Insert: {
          atualizada_em?: string
          horas_cancelamento?: number
          id?: boolean
          max_reposicoes_por_matricula?: number
          valor_checkin_wellhub_centavos?: number
        }
        Update: {
          atualizada_em?: string
          horas_cancelamento?: number
          id?: boolean
          max_reposicoes_por_matricula?: number
          valor_checkin_wellhub_centavos?: number
        }
        Relationships: []
      }
      config_financeiro: {
        Row: {
          atualizada_em: string
          id: boolean
          limite_mei_centavos: number
          meta_reserva_meses: number
          percentual_reserva: number
          saldo_inicial_centavos: number
          saldo_inicial_data: string
        }
        Insert: {
          atualizada_em?: string
          id?: boolean
          limite_mei_centavos?: number
          meta_reserva_meses?: number
          percentual_reserva?: number
          saldo_inicial_centavos?: number
          saldo_inicial_data?: string
        }
        Update: {
          atualizada_em?: string
          id?: boolean
          limite_mei_centavos?: number
          meta_reserva_meses?: number
          percentual_reserva?: number
          saldo_inicial_centavos?: number
          saldo_inicial_data?: string
        }
        Relationships: []
      }
      creditos_eventos: {
        Row: {
          agendamento_id: string | null
          criado_em: string
          criado_por: string | null
          delta: number
          detalhe: string | null
          id: string
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
            foreignKeyName: "creditos_eventos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "socias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creditos_eventos_matricula_id_fkey"
            columns: ["matricula_id"]
            isOneToOne: false
            referencedRelation: "matriculas"
            referencedColumns: ["id"]
          },
        ]
      }
      entradas_financeiras: {
        Row: {
          atualizada_em: string
          categoria: Database["public"]["Enums"]["categoria_entrada"]
          cliente_id: string | null
          criada_em: string
          data_caixa: string | null
          data_competencia: string
          data_prevista: string | null
          descricao: string | null
          id: string
          presenca_id: string | null
          status: Database["public"]["Enums"]["status_entrada"]
          valor_centavos: number
        }
        Insert: {
          atualizada_em?: string
          categoria: Database["public"]["Enums"]["categoria_entrada"]
          cliente_id?: string | null
          criada_em?: string
          data_caixa?: string | null
          data_competencia?: string
          data_prevista?: string | null
          descricao?: string | null
          id?: string
          presenca_id?: string | null
          status?: Database["public"]["Enums"]["status_entrada"]
          valor_centavos: number
        }
        Update: {
          atualizada_em?: string
          categoria?: Database["public"]["Enums"]["categoria_entrada"]
          cliente_id?: string | null
          criada_em?: string
          data_caixa?: string | null
          data_competencia?: string
          data_prevista?: string | null
          descricao?: string | null
          id?: string
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
            foreignKeyName: "entradas_financeiras_presenca_id_fkey"
            columns: ["presenca_id"]
            isOneToOne: false
            referencedRelation: "presencas"
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
            foreignKeyName: "followups_entrada_id_fkey"
            columns: ["entrada_id"]
            isOneToOne: false
            referencedRelation: "entradas_financeiras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followups_resolvido_por_fkey"
            columns: ["resolvido_por"]
            isOneToOne: false
            referencedRelation: "socias"
            referencedColumns: ["id"]
          },
        ]
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
            foreignKeyName: "interacoes_crm_socia_id_fkey"
            columns: ["socia_id"]
            isOneToOne: false
            referencedRelation: "socias"
            referencedColumns: ["id"]
          },
        ]
      }
      matriculas: {
        Row: {
          atualizada_em: string
          cliente_id: string
          criada_em: string
          creditos_total: number
          data_fim: string
          data_inicio: string
          id: string
          motivo_cancelamento: string | null
          plano_id: string
          status: Database["public"]["Enums"]["status_matricula"]
        }
        Insert: {
          atualizada_em?: string
          cliente_id: string
          criada_em?: string
          creditos_total: number
          data_fim: string
          data_inicio?: string
          id?: string
          motivo_cancelamento?: string | null
          plano_id: string
          status?: Database["public"]["Enums"]["status_matricula"]
        }
        Update: {
          atualizada_em?: string
          cliente_id?: string
          criada_em?: string
          creditos_total?: number
          data_fim?: string
          data_inicio?: string
          id?: string
          motivo_cancelamento?: string | null
          plano_id?: string
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
            foreignKeyName: "matriculas_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "planos"
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
            foreignKeyName: "movimentacoes_funil_socia_id_fkey"
            columns: ["socia_id"]
            isOneToOne: false
            referencedRelation: "socias"
            referencedColumns: ["id"]
          },
        ]
      }
      planos: {
        Row: {
          ativo: boolean
          atualizada_em: string
          criada_em: string
          id: string
          nome: string
          preco_centavos: number
          quantidade: number
          tipo: Database["public"]["Enums"]["plano_tipo"]
          vigencia_dias: number
        }
        Insert: {
          ativo?: boolean
          atualizada_em?: string
          criada_em?: string
          id?: string
          nome: string
          preco_centavos: number
          quantidade: number
          tipo: Database["public"]["Enums"]["plano_tipo"]
          vigencia_dias: number
        }
        Update: {
          ativo?: boolean
          atualizada_em?: string
          criada_em?: string
          id?: string
          nome?: string
          preco_centavos?: number
          quantidade?: number
          tipo?: Database["public"]["Enums"]["plano_tipo"]
          vigencia_dias?: number
        }
        Relationships: []
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
            foreignKeyName: "presencas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presencas_professora_id_fkey"
            columns: ["professora_id"]
            isOneToOne: false
            referencedRelation: "professoras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presencas_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
        ]
      }
      professoras: {
        Row: {
          ativa: boolean
          atualizada_em: string
          criada_em: string
          id: string
          nome: string
          telefone: string | null
          valor_por_aluna_centavos: number
        }
        Insert: {
          ativa?: boolean
          atualizada_em?: string
          criada_em?: string
          id?: string
          nome: string
          telefone?: string | null
          valor_por_aluna_centavos: number
        }
        Update: {
          ativa?: boolean
          atualizada_em?: string
          criada_em?: string
          id?: string
          nome?: string
          telefone?: string | null
          valor_por_aluna_centavos?: number
        }
        Relationships: []
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
          descricao: string | null
          id: string
          valor_centavos: number
        }
        Insert: {
          atualizada_em?: string
          categoria_id: string
          criada_em?: string
          data_caixa?: string
          descricao?: string | null
          id?: string
          valor_centavos: number
        }
        Update: {
          atualizada_em?: string
          categoria_id?: string
          criada_em?: string
          data_caixa?: string
          descricao?: string | null
          id?: string
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
        ]
      }
      socias: {
        Row: {
          criada_em: string
          id: string
          nome: string
        }
        Insert: {
          criada_em?: string
          id: string
          nome: string
        }
        Update: {
          criada_em?: string
          id?: string
          nome?: string
        }
        Relationships: []
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
          professora_id: string
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
          professora_id: string
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
          professora_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "turmas_professora_id_fkey"
            columns: ["professora_id"]
            isOneToOne: false
            referencedRelation: "professoras"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
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
      vw_pagamento_professoras: {
        Row: {
          alunas_presentes: number | null
          aulas: number | null
          mes: string | null
          professora: string | null
          professora_id: string | null
          total_centavos: number | null
        }
        Relationships: []
      }
      vw_saldo_caixa: {
        Row: {
          previsto_em_aberto_centavos: number | null
          saldo_atual_centavos: number | null
          saldo_projetado_centavos: number | null
        }
        Relationships: []
      }
      vw_saldo_creditos: {
        Row: {
          cliente_id: string | null
          creditos_total: number | null
          data_fim: string | null
          data_inicio: string | null
          matricula_id: string | null
          plano_id: string | null
          saldo: number | null
          status: Database["public"]["Enums"]["status_matricula"] | null
        }
        Relationships: []
      }
    }
    Functions: {
      agendar_aula: {
        Args: {
          p_cliente: string
          p_turma: string
          p_data: string
          p_canal: Database["public"]["Enums"]["canal_aula"]
        }
        Returns: string
      }
      cancelar_agendamento: {
        Args: {
          p_agendamento: string
          p_origem: Database["public"]["Enums"]["origem_cancelamento"]
        }
        Returns: boolean
      }
      gerar_followups: { Args: never; Returns: number }
      is_socia: { Args: never; Returns: boolean }
      matricular: {
        Args: { p_cliente: string; p_plano: string }
        Returns: string
      }
      registrar_presenca: {
        Args: {
          p_turma: string
          p_data: string
          p_cliente: string
          p_presente: boolean
          p_canal?: Database["public"]["Enums"]["canal_aula"]
        }
        Returns: string
      }
    }
    Enums: {
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
      motivo_credito:
        | "compra"
        | "agendamento"
        | "cancelamento"
        | "reposicao"
        | "ajuste"
      origem_cancelamento: "aluna" | "socia" | "professora" | "sistema"
      origem_cliente:
        | "whatsapp"
        | "instagram"
        | "wellhub"
        | "classpass"
        | "indicacao"
        | "passou_na_porta"
        | "outros"
      plano_tipo: "creditos" | "semanal"
      status_agendamento: "agendado" | "cancelado"
      status_entrada: "prevista" | "recebida"
      status_followup: "pendente" | "concluido" | "dispensado"
      status_matricula: "ativa" | "pausada" | "cancelada"
      tipo_evento_agendamento: "agendado" | "cancelado" | "presenca" | "falta"
      tipo_followup:
        | "lead_sumido"
        | "experimental_sem_retorno"
        | "cliente_inativa"
        | "aniversario"
        | "vencimento_plano"
      tipo_interacao: "nota" | "whatsapp" | "conversa" | "mudanca_estagio"
      tipo_movimento_reserva: "aporte" | "retirada"
      tipo_saida: "fixa" | "variavel"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      motivo_credito: [
        "compra",
        "agendamento",
        "cancelamento",
        "reposicao",
        "ajuste",
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
      ],
      plano_tipo: ["creditos", "semanal"],
      status_agendamento: ["agendado", "cancelado"],
      status_entrada: ["prevista", "recebida"],
      status_followup: ["pendente", "concluido", "dispensado"],
      status_matricula: ["ativa", "pausada", "cancelada"],
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
      tipo_saida: ["fixa", "variavel"],
    },
  },
} as const
