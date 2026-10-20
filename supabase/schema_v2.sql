-- Execute DEPOIS do schema.sql: liderança e ministérios

create table lideranca (
  id bigint generated always as identity primary key,
  area text not null check (area in ('pastoral','diaconia','ministerios')),
  nome text not null,
  cargo text,
  ordem int not null default 0
);

create table ministerios (
  id bigint generated always as identity primary key,
  nome text not null,
  descricao text,
  lider text,
  ordem int not null default 0
);

do $$ declare t text; begin
  foreach t in array array['lideranca','ministerios'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "leitura publica" on %I for select using (true)', t);
    execute format('create policy "escrita equipa" on %I for all using (public.is_staff()) with check (public.is_staff())', t);
  end loop;
end $$;

insert into lideranca (area, nome, cargo, ordem) values
 ('pastoral','Pr. Manuel Quixicongo','Pastor Titular & Coordenador de Discipulado',1),
 ('pastoral','Pr. André Baptista','Pastor Auxiliar / Ensino Teológico',2),
 ('diaconia','Diác. João Pedro','Presidente da Diaconia',1),
 ('diaconia','Diac.ª Teresa Bento','Ação Social & Apoio',2),
 ('ministerios','Ir. Gabriel Sousa','Ministério de Louvor',1),
 ('ministerios','Liderança Jovem Daniel','Jovens & Adolescentes',2),
 ('ministerios','Tia Sarah Quixicongo','Ministério Infantil',3);

insert into ministerios (nome, descricao, lider, ordem) values
 ('Ministério de Louvor e Adoração','Condução da adoração congregacional','Ir. Gabriel Sousa',1),
 ('Ministério de Jovens e Adolescentes','Geração de impacto e discipulado jovem','Líder Daniel K.',2),
 ('Ministério Infantil (EBD & Crianças)','Ensino bíblico lúdico para as crianças','Tia Sarah Quixicongo',3),
 ('Evangelismo e Missões Urbano','Evangelismo ao ar livre e nos bairros','Ev. Marcos Antonio',4),
 ('Ministério de Casais e Família','Fortalecimento dos laços matrimoniais','Casal Pires (Paulo & Ana)',5),
 ('Ação Social e Diaconia','Apoio a famílias carenciadas e comunitárias','Diac.ª Teresa Bento',6),
 ('Ministério de Intercessão e Oração Contínua','Vigílias, relógio de oração e suporte intercessor da igreja','Ir.ª Izabel Quixicongo',7);
