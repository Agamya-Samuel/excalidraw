-- Dashboard live updates: documents (owner), memberships, and invites.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.documents;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.doc_members;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.doc_invites;
    exception when duplicate_object then null;
    end;
  end if;
end
$$;

alter table public.documents replica identity full;
alter table public.doc_members replica identity full;
alter table public.doc_invites replica identity full;
