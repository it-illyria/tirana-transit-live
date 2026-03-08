-- Create storage bucket for GTFS cache
INSERT INTO storage.buckets (id, name, public)
VALUES ('gtfs-cache', 'gtfs-cache', false)
ON CONFLICT (id) DO NOTHING;

-- Allow edge functions (service role) full access to gtfs-cache bucket
CREATE POLICY "Allow all access to gtfs-cache"
ON storage.objects
FOR ALL
USING (bucket_id = 'gtfs-cache')
WITH CHECK (bucket_id = 'gtfs-cache');