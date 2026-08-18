create table public.property_chat_messages (
  id bigint generated always as identity primary key,
  valuation_id uuid not null references public.valuations(id) on delete cascade,
  role text not null check (role in ('USER', 'ASSISTANT')),
  content text not null check (char_length(content) between 1 and 20000),
  model text,
  created_at timestamptz not null default now(),
  constraint property_chat_messages_model_by_role check (
    (role = 'USER' and model is null)
    or (role = 'ASSISTANT' and model is not null)
  )
);

create index property_chat_messages_valuation_id_id_idx
  on public.property_chat_messages (valuation_id, id);

alter table public.property_chat_messages enable row level security;

revoke all on table public.property_chat_messages from anon;
revoke all on sequence public.property_chat_messages_id_seq from anon;
grant select, insert on table public.property_chat_messages to authenticated;
grant usage, select on sequence public.property_chat_messages_id_seq to authenticated;
grant all on table public.property_chat_messages to service_role;
grant all on sequence public.property_chat_messages_id_seq to service_role;

create policy "property chat readable by valuation owner or admin"
on public.property_chat_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.valuations valuation
    where valuation.id = property_chat_messages.valuation_id
      and (
        valuation.user_id = (select auth.uid())
        or (select public.is_admin())
      )
  )
);

create policy "property chat insertable by valuation owner or admin"
on public.property_chat_messages
for insert
to authenticated
with check (
  exists (
    select 1
    from public.valuations valuation
    where valuation.id = property_chat_messages.valuation_id
      and (
        valuation.user_id = (select auth.uid())
        or (select public.is_admin())
      )
  )
);
