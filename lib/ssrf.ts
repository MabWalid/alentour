import { lookup } from "node:dns/promises"
import { isIP } from "node:net"

function ipv4Private(host: string): boolean {
  const parts = host.split(".").map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false
  }
  const [a, b] = parts
  if (a === 0 || a === 10 || a === 127 || a === 255) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  return false
}

function ipv4FromNat64(host: string): string | null {
  const dotted = host.match(/^64:ff9b::(\d+\.\d+\.\d+\.\d+)$/i)
  if (dotted) return dotted[1]
  const hex = host.match(/^64:ff9b::([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i)
  if (!hex) return null
  const high = Number.parseInt(hex[1], 16)
  const low = Number.parseInt(hex[2], 16)
  return `${(high >> 8) & 255}.${high & 255}.${(low >> 8) & 255}.${low & 255}`
}

export function isPrivateAddress(address: string): boolean {
  const host = address.toLowerCase().replace(/^\[|\]$/g, "")
  if (
    host === "::" ||
    host === "::1" ||
    host === "0:0:0:0:0:0:0:0" ||
    host === "0:0:0:0:0:0:0:1"
  ) {
    return true
  }
  const nat64 = ipv4FromNat64(host)
  if (nat64) return ipv4Private(nat64)
  if (host.includes(":")) {
    if (host.startsWith("fe80:") || host.startsWith("fec0:")) return true
    if (host.startsWith("ff") || host.startsWith("fc") || host.startsWith("fd")) return true
    const mapped = host.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return ipv4Private(mapped[1])
    return false
  }
  return ipv4Private(host)
}

export function parseHttpUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error("Adresse du site illisible.")
  }
  if (url.username || url.password) throw new Error("Adresse du site refusée.")
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Seul un site http ou https peut être lu.")
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase()
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".arpa") ||
    host === "metadata.google.internal" ||
    host === "metadata.google.internal."
  ) {
    throw new Error("Adresse du site refusée.")
  }
  return url
}

export async function resolvePublicAddress(url: URL): Promise<string> {
  const host = url.hostname.replace(/^\[|\]$/g, "")
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new Error("Adresse du site refusée.")
    return host
  }
  let records: { address: string }[]
  try {
    records = await lookup(host, { all: true })
  } catch {
    throw new Error("Le site de l'entreprise ne répond pas.")
  }
  const publicRecords = records.filter((record) => !isPrivateAddress(record.address))
  if (records.length === 0 || publicRecords.length !== records.length) {
    throw new Error("Adresse du site refusée.")
  }
  return publicRecords[0].address
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  const url = parseHttpUrl(raw)
  await resolvePublicAddress(url)
  return url
}
