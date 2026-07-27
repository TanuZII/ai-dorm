import { Client } from 'ldapts'

export function ldapConfigured() {
  return Boolean(process.env.LDAP_URL && process.env.LDAP_BASE_DN)
}

export async function authenticateLdap(username, password) {
  if (!ldapConfigured()) return null
  const client = new Client({ url: process.env.LDAP_URL, timeout: 8000, connectTimeout: 8000 })
  try {
    if (process.env.LDAP_BIND_DN) await client.bind(process.env.LDAP_BIND_DN, process.env.LDAP_BIND_PASSWORD || '')
    const escaped = username.replaceAll('\\', '\\5c').replaceAll('*', '\\2a').replaceAll('(', '\\28').replaceAll(')', '\\29').replaceAll('\0', '\\00')
    const { searchEntries } = await client.search(process.env.LDAP_BASE_DN, {
      scope: 'sub',
      filter: (process.env.LDAP_USER_FILTER || '(sAMAccountName={{username}})').replace('{{username}}', escaped),
      attributes: ['dn', 'displayName', 'mail', 'userPrincipalName'],
      sizeLimit: 1,
    })
    const entry = searchEntries[0]
    if (!entry?.dn) return null
    await client.bind(entry.dn, password)
    return { username, displayName: entry.displayName || username, email: entry.mail || entry.userPrincipalName || null }
  } finally {
    await client.unbind().catch(() => {})
  }
}
