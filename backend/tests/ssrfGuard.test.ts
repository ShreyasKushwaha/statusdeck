import { describe, it, expect } from 'vitest';
import { isPrivateOrReservedIpv4, validateSafeUrl } from '../src/utils/ssrfGuard';

describe('SSRF Protection Guard', () => {
  describe('isPrivateOrReservedIpv4', () => {
    it('identifies loopback 127.0.0.1 as reserved', () => {
      expect(isPrivateOrReservedIpv4('127.0.0.1')).toBe(true);
      expect(isPrivateOrReservedIpv4('127.255.0.1')).toBe(true);
    });

    it('identifies AWS metadata IP 169.254.169.254 as reserved', () => {
      expect(isPrivateOrReservedIpv4('169.254.169.254')).toBe(true);
      expect(isPrivateOrReservedIpv4('169.254.1.1')).toBe(true);
    });

    it('identifies RFC 1918 private network IP ranges as reserved', () => {
      expect(isPrivateOrReservedIpv4('10.0.0.1')).toBe(true);
      expect(isPrivateOrReservedIpv4('10.254.12.9')).toBe(true);
      expect(isPrivateOrReservedIpv4('172.16.0.1')).toBe(true);
      expect(isPrivateOrReservedIpv4('172.31.255.254')).toBe(true);
      expect(isPrivateOrReservedIpv4('192.168.1.1')).toBe(true);
      expect(isPrivateOrReservedIpv4('192.168.100.50')).toBe(true);
    });

    it('permits valid public IP addresses', () => {
      expect(isPrivateOrReservedIpv4('8.8.8.8')).toBe(false);
      expect(isPrivateOrReservedIpv4('1.1.1.1')).toBe(false);
      expect(isPrivateOrReservedIpv4('142.250.190.46')).toBe(false);
    });
  });

  describe('validateSafeUrl', () => {
    it('rejects URLs targeting localhost or 127.0.0.1', async () => {
      const resLocal = await validateSafeUrl('http://localhost:8080/metrics');
      expect(resLocal.isSafe).toBe(false);

      const resIp = await validateSafeUrl('http://127.0.0.1/admin');
      expect(resIp.isSafe).toBe(false);
    });

    it('rejects URLs targeting AWS Instance Metadata service (IMDS)', async () => {
      const res = await validateSafeUrl('http://169.254.169.254/latest/meta-data/');
      expect(res.isSafe).toBe(false);
      expect(res.reason).toContain('SSRF blocked');
    });

    it('rejects non-HTTP protocols like file:// or ftp://', async () => {
      const resFile = await validateSafeUrl('file:///etc/passwd');
      expect(resFile.isSafe).toBe(false);

      const resFtp = await validateSafeUrl('ftp://internal.server/data');
      expect(resFtp.isSafe).toBe(false);
    });

    it('allows valid public HTTPS targets', async () => {
      const res = await validateSafeUrl('https://example.com/health');
      expect(res.isSafe).toBe(true);
    });
  });
});
