-- Contato de emergência do aluno (estúdio de atividade física: se alguém
-- passa mal na aula, a equipe precisa saber quem acionar). Dois campos
-- simples, ambos opcionais — nome de quem chamar + telefone.
alter table clientes add column if not exists contato_emergencia_nome text;
alter table clientes add column if not exists contato_emergencia_telefone text;

comment on column clientes.contato_emergencia_nome is
  'Nome de quem acionar em caso de emergência na aula';
comment on column clientes.contato_emergencia_telefone is
  'Telefone do contato de emergência';
