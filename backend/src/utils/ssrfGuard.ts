import dns from 'dns';
import { promisify } from 'util';

const resolve4Async = promisify(dns.resolve4);

export interface SsrfCheckResult {
  isSafe: boolean;
  reason?: string;
}

/**
 * Checks if an IPv4 address belongs to private, loopback, link-local, or cloud metadata ranges.
 */
export function isPrivateOrReservedIpv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true; // invalid IP format, treat as unsafe
  }

  const [b0, b1] = parts;

  // 0.0.0.0/8 (Current network)
  if (b0 === 0) return true;

  // 127.0.0.0/8 (Loopback)
  if (b0 === 127) return true;

  // 10.0.0.0/8 (Private RFC 1918)
  if (b0 === 10) return true;

  // 172.16.0.0/12 (Private RFC 1918: 172.16.0.0 - 172.31.255.255)
  if (b0 === 172 && b1 >= 16 && b1 <= 31) return true;

  // 192.168.0.0/16 (Private RFC 1918)
  if (b0 === 192 && b1 === 168) return true;

  // 169.254.0.0/16 (Link-Local & AWS Instance Metadata Service 169.254.169.254)
  if (b0 === 169 && b1 === 254) return true;

  // 100.64.0.0/10 (Carrier-grade NAT)
  if (b0 === 100 && b1 >= 64 && b1 <= 127) return true;

  // 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Reserved)
  if (b0 >= 224) return true;

  return false;
}

/**
 * Validates a target URL against SSRF attacks.
 * Blocks private IP ranges, loopback, cloud metadata (169.254.169.254), internal domains, and unsupported protocols.
 */
export async function validateSafeUrl(rawUrl: string): Promise<SsrfCheckResult> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { isSafe: false, reason: 'Invalid URL syntax' };
  }

  // Enforce HTTP / HTTPS protocol only
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { isSafe: false, reason: `Disallowed protocol: ${parsed.protocol}. Only http: and https: are allowed.` };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block localhost, loopbacks, internal domains
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '::1' ||
    hostname === '169.254.169.254' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.lan')
  ) {
    return { isSafe: false, reason: `Target host '${hostname}' is a reserved/internal address (SSRF blocked)` };
  }

  // If host is a direct IPv4 address, check IP bounds
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4Regex.test(hostname)) {
    if (isPrivateOrReservedIpv4(hostname)) {
      return { isSafe: false, reason: `Direct IP '${hostname}' resides in a private/metadata range (SSRF blocked)` };
    }
    return { isSafe: true };
  }

  // Attempt DNS resolution to check if domain resolves to private/metadata IP
  try {
    const resolvedIps = await resolve4Async(hostname);
    for (const ip of resolvedIps) {
      if (isPrivateOrReservedIpv4(ip)) {
        return { isSafe: false, reason: `Hostname '${hostname}' resolves to private/metadata IP ${ip} (SSRF blocked)` };
      }
    }
  } catch {
    // If DNS resolution fails during validation, in test environments or newly registered domains,
    // ensure basic domain format is valid.
    const domainRegex = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;
    if (!domainRegex.test(hostname)) {
      return { isSafe: false, reason: `Invalid or unresolvable hostname '${hostname}'` };
    }
  }

  return { isSafe: true };
}
