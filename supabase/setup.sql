-- ============================================================
-- PicWord Quest 云端账号存储：在 Supabase 后台 SQL Editor 里运行一次即可（可重复运行）
--
-- 所有数据放在私有存储桶 picword 里，每个账号只能读写自己的文件夹 <用户ID>/：
--   <用户ID>/data.json        存档（生词本 / 关卡库 / 战绩）
--   <用户ID>/dict/manifest.json + part-000…  图解词典（分块，免费版单文件有大小上限）
-- 权限由下面的行级安全策略在服务器端保证，前端代码改不了。
-- ============================================================

insert into storage.buckets (id, name, public)
values ('picword', 'picword', false)
on conflict (id) do update set public = false;

drop policy if exists "picword own read" on storage.objects;
drop policy if exists "picword own insert" on storage.objects;
drop policy if exists "picword own update" on storage.objects;
drop policy if exists "picword own delete" on storage.objects;

create policy "picword own read" on storage.objects
  for select to authenticated
  using (bucket_id = 'picword' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "picword own insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'picword' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "picword own update" on storage.objects
  for update to authenticated
  using (bucket_id = 'picword' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'picword' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "picword own delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'picword' and (storage.foldername(name))[1] = auth.uid()::text);
