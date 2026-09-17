/*
# Storage policies for private audio bucket

## Purpose
Allow authenticated users to upload, read, and delete their own audio files
in the private `audio` storage bucket. Files are stored under a per-user path
prefix: `<user_id>/<work_id>/<filename>`.

## Security
- RLS policies on storage.objects scoped to the `audio` bucket only.
- Users can only manage objects under their own user_id path prefix.
*/

DROP POLICY IF EXISTS "audio_upload_own" ON storage.objects;
CREATE POLICY "audio_upload_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'audio'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "audio_read_own" ON storage.objects;
CREATE POLICY "audio_read_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'audio'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "audio_delete_own" ON storage.objects;
CREATE POLICY "audio_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'audio'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );