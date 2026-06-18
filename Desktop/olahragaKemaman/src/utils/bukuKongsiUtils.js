/**
 * bukuKongsiUtils.js
 * ──────────────────
 * Helper untuk Buku Kejohanan share — Google Drive sahaja.
 *
 * Pattern URL Google Drive yang disokong:
 *   - https://drive.google.com/file/d/{FILE_ID}/view?usp=sharing
 *   - https://drive.google.com/file/d/{FILE_ID}/view
 *   - https://drive.google.com/open?id={FILE_ID}
 *   - https://drive.google.com/uc?id={FILE_ID}&export=download
 */

const DRIVE_FILE_ID_REGEX = /\/d\/([a-zA-Z0-9_-]+)/
const DRIVE_OPEN_ID_REGEX = /[?&]id=([a-zA-Z0-9_-]+)/

/**
 * Extract FILE_ID dari URL Google Drive.
 * @returns {string|null}
 */
export function extractDriveFileId(url) {
  if (!url || typeof url !== 'string') return null
  const m1 = url.match(DRIVE_FILE_ID_REGEX)
  if (m1) return m1[1]
  const m2 = url.match(DRIVE_OPEN_ID_REGEX)
  if (m2) return m2[1]
  return null
}

/**
 * Validate URL adalah Google Drive yang sah.
 * @returns {boolean}
 */
export function isValidDriveUrl(url) {
  if (!url || typeof url !== 'string') return false
  if (!url.startsWith('https://')) return false
  try {
    const u = new URL(url)
    if (!u.hostname.includes('drive.google.com')) return false
    return !!extractDriveFileId(url)
  } catch {
    return false
  }
}

/**
 * Convert mana-mana format URL Drive → View Link (paling selamat).
 * PP klik → buka Drive viewer dalam tab baru → ada butang download.
 *
 * @returns {string|null} View link, atau null kalau invalid
 */
export function driveViewUrl(url) {
  const id = extractDriveFileId(url)
  if (!id) return null
  return `https://drive.google.com/file/d/${id}/view`
}
