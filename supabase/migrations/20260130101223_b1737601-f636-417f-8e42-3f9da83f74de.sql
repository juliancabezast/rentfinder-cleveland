-- Create storage bucket for property photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('property-photos', 'property-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to property-photos bucket
CREATE POLICY "Authenticated users can upload property photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'property-photos');

-- Allow authenticated users to update their uploads
CREATE POLICY "Authenticated users can update property photos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'property-photos');

-- Allow authenticated users to delete property photos
CREATE POLICY "Authenticated users can delete property photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'property-photos');

-- Allow public read access for property photos
CREATE POLICY "Public read access for property photos"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'property-photos');