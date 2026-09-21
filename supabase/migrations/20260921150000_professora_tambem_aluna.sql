-- ============================================================
-- A professora passa a poder ser aluna com o MESMO login.
--
-- Decisão da gestão (21/09/2026): as professoras têm cortesia de aula
-- (Plano Equipe, 16 pessoas) e precisam agendar como qualquer aluno.
-- Exigir um segundo e-mail só para isso é atrito inventado — a pessoa é
-- uma só.
--
-- O que havia: `validar_papel_exclusivo` (20260721110000) recusava
-- `contas_aluna` para quem já tinha `contas_professora`, e vice-versa.
-- O motivo registrado na época: "as policies de RLS se somam, então uma
-- conta com os dois vínculos enxergaria a união dos dois acessos".
--
-- Por que a união é aceitável aqui — a frase estava certa, a conclusão
-- é que mudou. Quatro tabelas têm policy dos dois papéis ao mesmo
-- tempo: `agendamentos`, `presencas`, `turmas` e `matricula_turmas`.
-- Em todas, os dois recortes são pessoais e disjuntos:
--
--   pelo lado professora → as turmas que ELA dá e quem está nelas
--   pelo lado aluna ......→ as reservas e presenças DELA
--
-- A união disso é exatamente "a professora que também treina aqui".
-- Não existe policy que combine `is_cliente()` com `is_professora()`
-- na mesma expressão (conferido: zero ocorrências), então não há efeito
-- cruzado — só a soma de dois conjuntos que já eram dela.
--
-- O que NÃO muda:
--   - Equipe interna continua barrada de virar aluna pelo mesmo login:
--     `promover_a_equipe()` recusa e-mail que já é de aluna, e isso fica
--     como está. Equipe vê dinheiro; é outro tipo de risco.
--   - Nenhum papel se concede sozinho. `handle_new_user()` segue só
--     criando vínculo de professora quando o e-mail já está cadastrado
--     em `professoras` pela equipe.
--
-- Efeito prático: a mesma pessoa abre /portalequipe para dar aula e
-- /agendamentos para treinar, com o mesmo login. Qual portal aparece é
-- decidido pelo caminho da URL (src/App.tsx), não pelo papel.
-- ============================================================

drop trigger if exists contas_aluna_papel_exclusivo on public.contas_aluna;
drop trigger if exists contas_professora_papel_exclusivo on public.contas_professora;
drop function if exists public.validar_papel_exclusivo();

comment on table public.contas_aluna is
  'Vínculo login -> cliente. Desde 21/09/2026 a mesma conta pode ter também vínculo de professora (ver 20260921150000): professora que treina no estúdio usa um login só. Equipe interna segue sendo outro e-mail.';
comment on table public.contas_professora is
  'Vínculo login -> professora. Desde 21/09/2026 pode coexistir com contas_aluna para a mesma conta (ver 20260921150000).';
