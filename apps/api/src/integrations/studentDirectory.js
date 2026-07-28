export function createStudentDirectory(env = process.env, fetchImpl = fetch) {
  const template = env.STUDENT_SERVICE_LOOKUP_URL
  if (!template) return null
  return {
    async lookup(studentId) {
      const url = template.replace('{studentId}', encodeURIComponent(studentId))
      const response = await fetchImpl(url, {
        headers: {
          accept: 'application/json',
          ...(env.STUDENT_SERVICE_TOKEN ? { authorization: `Bearer ${env.STUDENT_SERVICE_TOKEN}` } : {}),
        },
        signal: AbortSignal.timeout(Number(env.STUDENT_SERVICE_TIMEOUT_MS) || 8000),
      })
      if (response.status === 404) return null
      if (!response.ok) throw Object.assign(new Error(`Student Service responded with ${response.status}`), { status: 502, code: 'STUDENT_SERVICE_ERROR' })
      return response.json()
    },
  }
}
