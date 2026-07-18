const SENSITIVE_KEYS = [
  'cookie',
  'authorization',
  'sessdata',
  'set-cookie',
  'x-install-id',
  'install-id',
  'installid',
  'x-openrouter-api-key',
];

export function sanitize(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitize);
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.includes(lowerKey)) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      result[key] = sanitize(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}
