-- Administrators administer every state and do not belong to a jurisdiction.
alter table public.profiles
  alter column state_code drop not null;

update public.profiles
set state_code = null
where role = 'ADMIN';

alter table public.profiles
  add constraint profiles_role_state_scope_check
  check (
    (role = 'ADMIN' and state_code is null)
    or (role = 'USER' and state_code is not null)
  );

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  assigned_role public.app_role;
begin
  assigned_role := case
    when lower(new.email) = lower(coalesce(current_setting('app.owner_admin_email', true), ''))
      then 'ADMIN'::public.app_role
    else 'USER'::public.app_role
  end;

  insert into public.profiles (id, role, display_name, phone, address, state_code)
  values (
    new.id,
    assigned_role,
    coalesce(new.raw_user_meta_data ->> 'display_name', 'ValuerAI User'),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'address', ''), 'Not provided'),
    case
      when assigned_role = 'ADMIN' then null
      else coalesce(nullif(new.raw_user_meta_data ->> 'state_code', ''), 'TR')
    end
  );
  return new;
end; $$;
