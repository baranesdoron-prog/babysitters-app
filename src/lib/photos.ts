import { useEffect, useState } from 'react'

import { supabase } from './supabase'

const BUCKET = 'photos'
const SIGNED_URL_SECONDS = 60 * 10

/** A short-lived signed URL for a photo path, or null while loading / when there is none. */
export function usePhotoUrl(path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!path) {
      setUrl(null)
      return
    }
    let cancelled = false
    supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGNED_URL_SECONDS)
      .then(({ data }) => {
        if (!cancelled) setUrl(data?.signedUrl ?? null)
      })
    return () => {
      cancelled = true
    }
  }, [path])

  return url
}

/** Shrink a picked image to ~512px JPEG on the phone before uploading. */
async function resizeToJpeg(file: File, maxSize = 512): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('resize failed'))), 'image/jpeg', 0.85),
  )
}

/**
 * Upload a photo to photos/<folder>/<id>.jpg and return that path.
 * Storage policies decide who may write where (migration 0003).
 */
export async function uploadPhoto(folder: 'parents' | 'babysitters' | 'children', id: string, file: File) {
  const blob = await resizeToJpeg(file)
  const path = `${folder}/${id}.jpg`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '0' })
  if (error) throw error
  return path
}
