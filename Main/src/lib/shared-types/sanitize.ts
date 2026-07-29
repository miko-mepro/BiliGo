const SENSITIVE_KEYS = [
  'cookie',
  'authorization',
  'sessdata',
  'set-cookie',
  'x-install-id',
  'install-id',
  'installid',
  'x-openrouter-api-key',
  'apikey',
  'api-key',
  'api_key',
  'x-api-key',
  'x-goog-api-key',
  'proxy-authorization',
];

export function sanitize(obj: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  if (seen.has(obj as object)) {
    return '[Circular]';
  }
  seen.add(obj as object);

  if (Array.isArray(obj)) {
    return obj.map(item => sanitize(item, seen));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.includes(lowerKey)) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      result[key] = sanitize(value, seen);
    } else {
      result[key] = value;
    }
  }
  return result;
}
