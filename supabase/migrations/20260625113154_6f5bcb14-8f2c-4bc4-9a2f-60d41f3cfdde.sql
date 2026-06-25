
CREATE POLICY "gallery_read_auth" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'gallery');
CREATE POLICY "gallery_ins_own" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'gallery' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "gallery_del_own" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'gallery' AND (storage.foldername(name))[1] = auth.uid()::text);
