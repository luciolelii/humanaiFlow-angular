/** `structuredClone` with a JSON round-trip fallback for non-cloneable runtime fields. */
export function deepClone<T>(value: T): T {
  if (typeof globalThis.structuredClone === 'function') {
    try {
      return globalThis.structuredClone(value);
    } catch {
      // Some cached payloads may carry non-cloneable runtime fields.
    }
  }
  return JSON.parse(JSON.stringify(value)) as T;
}
