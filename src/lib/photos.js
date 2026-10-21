// Progress photos: resized on the phone and kept in the app's private storage.
// They are never uploaded, shared with the crew, or included in JSON backups.
import { Filesystem, Directory } from '@capacitor/filesystem'

const DIR = 'photos'
const cache = new Map() // file → data URL

function loadImage (file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image')) }
    img.src = url
  })
}

function toJpegBase64 (img, maxSide, quality) {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.round(img.naturalWidth * scale)
  const h = Math.round(img.naturalHeight * scale)
  const cv = document.createElement('canvas')
  cv.width = w; cv.height = h
  cv.getContext('2d').drawImage(img, 0, 0, w, h)
  return cv.toDataURL('image/jpeg', quality).split(',')[1]
}

/** A small JPEG data URL (for your own exercises' photos, which travel inside the data file and backups). */
export async function imageDataUrl (fileObj, maxSide = 480, quality = 0.76) {
  const img = await loadImage(fileObj)
  return 'data:image/jpeg;base64,' + toJpegBase64(img, maxSide, quality)
}

/** Resize and store a picked image. Returns { file, thumb } paths. */
export async function savePhoto (fileObj, id) {
  const img = await loadImage(fileObj)
  const full = toJpegBase64(img, 1440, 0.84)
  const small = toJpegBase64(img, 360, 0.78)
  const file = `${DIR}/${id}.jpg`
  const thumb = `${DIR}/${id}-t.jpg`
  await Filesystem.writeFile({ path: file, data: full, directory: Directory.Data, recursive: true })
  await Filesystem.writeFile({ path: thumb, data: small, directory: Directory.Data, recursive: true })
  return { file, thumb }
}

export async function photoUrl (path) {
  if (!path) return ''
  if (cache.has(path)) return cache.get(path)
  try {
    const res = await Filesystem.readFile({ path, directory: Directory.Data })
    const b64 = typeof res.data === 'string' ? res.data : await blobToBase64(res.data)
    const url = 'data:image/jpeg;base64,' + b64
    cache.set(path, url)
    return url
  } catch {
    return ''
  }
}

export async function deletePhotoFiles (p) {
  for (const path of [p.file, p.thumb].filter(Boolean)) {
    cache.delete(path)
    try { await Filesystem.deleteFile({ path, directory: Directory.Data }) } catch { /* already gone */ }
  }
}

function blobToBase64 (blob) {
  return new Promise((resolve) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1])
    r.readAsDataURL(blob)
  })
}
