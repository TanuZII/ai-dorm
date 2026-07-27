const TOKEN_KEY = 'campus_nest_token'

export const session = {
  getToken: () => sessionStorage.getItem(TOKEN_KEY),
  setToken: token => sessionStorage.setItem(TOKEN_KEY, token),
  clear: () => sessionStorage.removeItem(TOKEN_KEY),
}

export async function api(path, options = {}) {
  let response
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      headers: { 'content-type': 'application/json', ...(session.getToken() ? { authorization: `Bearer ${session.getToken()}` } : {}), ...options.headers },
      body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body,
    })
  } catch {
    throw new Error('เชื่อมต่อ Backend ไม่ได้ กรุณาตรวจสอบว่า API กำลังทำงาน')
  }
  return parseApiResponse(response, path)
}

export async function parseApiResponse(response, path = '') {
  if (response.status === 204) return null
  const contentType = response.headers.get('content-type') || ''
  const text = await response.text()
  if (contentType.includes('application/json')) {
    let body
    try { body = text ? JSON.parse(text) : null } catch { throw new Error(`API ${path} ส่งข้อมูล JSON ไม่สมบูรณ์`) }
    if (!response.ok) throw new Error(body?.message || `API ${path} ตอบกลับด้วยสถานะ ${response.status}`)
    return body
  }
  const hint = response.status === 404
    ? 'ไม่พบ API endpoint นี้ อาจกำลังใช้ Backend รุ่นเก่า กรุณา restart Backend'
    : 'API ตอบกลับในรูปแบบที่ไม่รองรับ กรุณาตรวจสอบ Backend และ Proxy'
  throw new Error(`${hint} (${path || '/api'}, HTTP ${response.status})`)
}

export async function login(username, password) {
  const result = await api('/auth/login', { method: 'POST', body: { username, password } })
  session.setToken(result.token)
  return result.user
}

export async function downloadApiFile(path, fallbackName) {
  const response = await fetch(`/api${path}`, { headers: session.getToken() ? { authorization: `Bearer ${session.getToken()}` } : {} })
  if (!response.ok) return parseApiResponse(response, path)
  const blob = await response.blob()
  const disposition = response.headers.get('content-disposition') || ''
  const filename = disposition.match(/filename="([^"]+)"/)?.[1] || fallbackName
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click()
  URL.revokeObjectURL(url)
}

export async function openApiFile(path) {
  const response = await fetch(`/api${path}`, { headers: session.getToken() ? { authorization: `Bearer ${session.getToken()}` } : {} })
  if (!response.ok) return parseApiResponse(response, path)
  const url = URL.createObjectURL(await response.blob())
  window.open(url, '_blank', 'noopener,noreferrer')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
