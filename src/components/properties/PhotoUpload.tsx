import React, { useCallback, useState, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Upload, X, GripVertical, Image as ImageIcon, Loader2, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { convertToWebP } from '@/lib/imageUtils';

interface PhotoUploadProps {
  photos: string[];
  onChange: (photos: string[]) => void;
  propertyId?: string;
}

export const PhotoUpload: React.FC<PhotoUploadProps> = ({
  photos,
  onChange,
  propertyId,
}) => {
  const { userRecord, organization } = useAuth();
  const { canUploadPhotos } = usePermissions();
  const [uploading, setUploading] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  // During a drag the reorder lives in local state only and is committed to
  // the parent ONCE on drag end — calling onChange per position crossed fired
  // one racing DB UPDATE each in PropertyDetail, so an intermediate order
  // could persist as the final one.
  const [dragPhotos, setDragPhotos] = useState<string[] | null>(null);
  const [canManagePhotos, setCanManagePhotos] = useState(true);
  const [checkingPermission, setCheckingPermission] = useState(true);

  // Check if the user has permission based on organization settings
  useEffect(() => {
    const checkPermission = async () => {
      setCheckingPermission(true);
      
      // Super admins and admins always have permission
      if (userRecord?.role === 'super_admin' || userRecord?.role === 'admin') {
        setCanManagePhotos(true);
        setCheckingPermission(false);
        return;
      }

      // Editors need to check the organization setting
      if (userRecord?.role === 'editor' && organization?.id) {
        try {
          const { data } = await supabase
            .from('organization_settings')
            .select('value')
            .eq('organization_id', organization.id)
            .eq('key', 'photo_upload_restricted')
            .single();

          // If restricted is true, editors cannot manage photos
          setCanManagePhotos(!data?.value);
        } catch (error) {
          // If setting doesn't exist, default to allowing editors
          setCanManagePhotos(true);
        }
      } else {
        // Viewers and leasing agents cannot manage photos
        setCanManagePhotos(false);
      }
      
      setCheckingPermission(false);
    };

    if (userRecord) {
      checkPermission();
    }
  }, [organization?.id, userRecord?.role, userRecord]);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;

      setUploading(true);
      const newPhotos: string[] = [];

      try {
        for (const file of acceptedFiles) {
          // Convert to WebP for smaller file size
          let uploadFile: File;
          try {
            uploadFile = await convertToWebP(file);
          } catch {
            // Conversion failed (e.g. the browser can't decode HEIC/TIFF in a
            // <canvas>) — upload the original bytes, but NOT under a .webp name,
            // or the stored object serves as a broken/blank image.
            uploadFile = file;
          }

          // Extension + content-type follow the ACTUAL bytes being uploaded
          // (webp on success, the original format on fallback), so an object is
          // never a non-webp file mislabeled .webp.
          const extMatch = uploadFile.name.match(/\.([a-zA-Z0-9]+)$/);
          const ext = (extMatch ? extMatch[1] : "jpg").toLowerCase();
          const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
          // New-property uploads go to an org-scoped temp prefix so storage RLS can authorize
          // them (a bare properties/temp/ path matched no property row and failed for non-admins).
          const filePath = propertyId
            ? `properties/${propertyId}/${fileName}`
            : `properties/temp/${userRecord?.organization_id ?? "unknown"}/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from('property-photos')
            .upload(filePath, uploadFile, uploadFile.type ? { contentType: uploadFile.type } : undefined);

          if (uploadError) {
            console.error('Upload error:', uploadError);
            toast.error(`Failed to upload ${file.name}`);
            continue;
          }

          const { data: { publicUrl } } = supabase.storage
            .from('property-photos')
            .getPublicUrl(filePath);

          newPhotos.push(publicUrl);
        }

        if (newPhotos.length > 0) {
          onChange([...photos, ...newPhotos]);
          toast.success(`${newPhotos.length} photo(s) uploaded`);
        }
      } catch (error) {
        console.error('Upload error:', error);
        toast.error('Failed to upload photos');
      } finally {
        setUploading(false);
      }
    },
    [photos, onChange, propertyId]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.webp', '.heic', '.bmp', '.tiff', '.tif', '.gif'],
    },
    maxSize: 10 * 1024 * 1024, // 10MB
  });

  /** Best-effort storage cleanup for a removed photo. Only touches objects in
   *  our property-photos bucket, and only once no property row references the
   *  URL anymore (imports can share one upload across units). Never blocks
   *  the UI — a leaked object is better than a broken gallery. */
  const cleanupStorageObject = (url: string) => {
    const marker = '/storage/v1/object/public/property-photos/';
    const idx = url.indexOf(marker);
    if (idx === -1) return; // external URL (e.g. imported listing photo)
    const path = decodeURIComponent(url.slice(idx + marker.length).split('?')[0]);
    // Give the parent's persist a moment, then delete only if unreferenced.
    setTimeout(async () => {
      try {
        const { count } = await supabase
          .from('properties')
          .select('id', { count: 'exact', head: true })
          .contains('photos', JSON.stringify([url]));
        if (count === 0) {
          await supabase.storage.from('property-photos').remove([path]);
        }
      } catch (err) {
        console.error('Photo storage cleanup failed:', err);
      }
    }, 2000);
  };

  const removePhoto = (index: number) => {
    const removed = photos[index];
    const newPhotos = photos.filter((_, i) => i !== index);
    onChange(newPhotos);
    if (removed) cleanupStorageObject(removed);
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
    setDragPhotos(photos);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    setDragPhotos((prev) => {
      const base = prev ?? photos;
      const newPhotos = [...base];
      const [draggedPhoto] = newPhotos.splice(draggedIndex, 1);
      newPhotos.splice(index, 0, draggedPhoto);
      return newPhotos;
    });
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    // Persist the final order exactly once.
    if (dragPhotos && dragPhotos.some((p, i) => p !== photos[i])) {
      onChange(dragPhotos);
    }
    setDragPhotos(null);
    setDraggedIndex(null);
  };

  // Show loading state while checking permissions
  if (checkingPermission) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Show message if user doesn't have permission
  if (!canUploadPhotos || !canManagePhotos) {
    return (
      <div className="space-y-4">
        <div className="text-center py-8 border-2 border-dashed border-border rounded-lg bg-muted/30">
          <Lock className="h-12 w-12 mx-auto mb-2 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground font-medium">You don't have permission to manage photos.</p>
          <p className="text-sm text-muted-foreground">Contact an administrator for access.</p>
        </div>
        
        {/* Still show existing photos in read-only mode */}
        {photos.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">
              Photos ({photos.length})
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {photos.map((photo, index) => (
                <div
                  key={photo}
                  className={cn(
                    'relative aspect-video rounded-lg overflow-hidden border',
                    index === 0 && 'ring-2 ring-primary'
                  )}
                >
                  <img
                    src={photo}
                    alt={`Property photo ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                  {index === 0 && (
                    <span className="absolute top-1 left-1 text-[10px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded">
                      Main
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        {...getRootProps()}
        className={cn(
          'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
          isDragActive
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50 hover:bg-muted/50',
          uploading && 'pointer-events-none opacity-50'
        )}
      >
        <input {...getInputProps()} />
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Uploading photos...</p>
          </div>
        ) : isDragActive ? (
          <div className="flex flex-col items-center gap-2">
            <Upload className="h-10 w-10 text-primary" />
            <p className="text-sm text-primary font-medium">Drop photos here</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <ImageIcon className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Drag & drop photos here, or click to select
            </p>
            <p className="text-xs text-muted-foreground">
              Any image format up to 10MB (auto-converted to WebP)
            </p>
          </div>
        )}
      </div>

      {/* Photo Thumbnails (dragPhotos = in-flight reorder preview) */}
      {photos.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">
            Photos ({photos.length}) - Drag to reorder, first photo is the main image
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {(dragPhotos ?? photos).map((photo, index) => (
              <div
                key={photo}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                className={cn(
                  'relative aspect-video rounded-lg overflow-hidden border group cursor-move',
                  index === 0 && 'ring-2 ring-primary',
                  draggedIndex === index && 'opacity-50'
                )}
              >
                <img
                  src={photo}
                  alt={`Property photo ${index + 1}`}
                  className="w-full h-full object-cover"
                />
                {/* Overlay */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                  <GripVertical className="h-5 w-5 text-white" />
                </div>
                {/* Main Badge */}
                {index === 0 && (
                  <span className="absolute top-1 left-1 text-[10px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded">
                    Main
                  </span>
                )}
                {/* Remove Button */}
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Remove photo"
                  onClick={() => removePhoto(index)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
