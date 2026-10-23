import { lookup } from "node:dns/promises"
import { isIP } from "node:net"

function ipv4Private(host: string): boolean {
  const parts = host.split(".").map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false
  }
  const [a, b] = parts
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  return false
}

export function isPrivateAddress(address: string): boolean {
  const host = address.toLowerCase().replace(/^\[|\]$/g, "")
  if (host === "::1" || host === "0:0:0:0:0:0:0:1") return true
  if (host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) return true
  if (host.includes(":")) {
    const mapped = host.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return ipv4Private(mapped[1])
    return false
  }
  return ipv4Private(host)
}

export async function assertPublicUrl(raw: string): Promise<URL> {
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
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "metadata.google.internal"
  ) {
    throw new Error("Adresse du site refusée.")
  }
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new Error("Adresse du site refusée.")
    return url
  }
  let records: { address: string }[]
  try {
    records = await lookup(host, { all: true })
  } catch {
    throw new Error("Le site de l'entreprise ne répond pas.")
  }
  if (records.length === 0 || records.some((record) => isPrivateAddress(record.address))) {
    throw new Error("Adresse du site refusée.")
  }
  return url
}
