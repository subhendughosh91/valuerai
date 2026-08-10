alter table public.valuations
add column custom_instructions text;

alter table public.valuations
add constraint valuations_custom_instructions_length
check (custom_instructions is null or char_length(custom_instructions) <= 4000);
