import { sanitizeForLog } from './sanitize';

describe('sanitizeForLog', () => {
  it('redacts known sensitive keys at the top level', () => {
    const result = sanitizeForLog({ email: 'user@example.com', password: 'super-secret' }) as Record<
      string,
      unknown
    >;
    expect(result.email).toBe('user@example.com');
    expect(result.password).toBe('[REDACTED]');
  });

  it('redacts sensitive keys nested inside objects and arrays', () => {
    const result = sanitizeForLog({
      user: { name: 'Ana', refreshToken: 'abc123' },
      sessions: [{ accessToken: 'xyz', ip: '127.0.0.1' }],
    }) as Record<string, unknown>;

    const user = result.user as Record<string, unknown>;
    expect(user.name).toBe('Ana');
    expect(user.refreshToken).toBe('[REDACTED]');

    const sessions = result.sessions as Array<Record<string, unknown>>;
    expect(sessions[0].accessToken).toBe('[REDACTED]');
    expect(sessions[0].ip).toBe('127.0.0.1');
  });

  it('is case-insensitive when matching sensitive keys', () => {
    const result = sanitizeForLog({ Authorization: 'Bearer token' }) as Record<string, unknown>;
    expect(result.Authorization).toBe('[REDACTED]');
  });

  it('passes through primitives and null/undefined unchanged', () => {
    expect(sanitizeForLog('hello')).toBe('hello');
    expect(sanitizeForLog(42)).toBe(42);
    expect(sanitizeForLog(null)).toBeNull();
    expect(sanitizeForLog(undefined)).toBeUndefined();
  });
});
