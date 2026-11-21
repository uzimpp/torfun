import type { FastifyInstance } from 'fastify';

export interface RouteEntry {
  method: string;
  /** Path with every `:param` replaced by a syntactically valid value. */
  url: string;
}

/**
 * Every route the app serves, read back from Fastify's own routing table.
 *
 * Security tests iterate this instead of a hand-written list, so a route added
 * next month is covered the day it lands and cannot quietly skip a guard.
 * `printRoutes` is a tree; the depth of each line says which parent path it
 * extends.
 */
export function listRoutes(
  app: FastifyInstance,
  paramValue = '64b7f0c2a1b2c3d4e5f60718',
): RouteEntry[] {
  const stack: string[] = [];
  const found: RouteEntry[] = [];

  for (const line of app.printRoutes({ commonPrefix: false }).split('\n')) {
    const match = /^((?:│ {3}| {4})*)[├└]── (\S+) \(([^)]*)\)/.exec(line);
    if (!match) continue;
    const depth = (match[1] ?? '').length / 4;
    stack.length = depth;
    stack[depth] = match[2] ?? '';
    const path = stack.join('').replace(/:[A-Za-z]+/g, paramValue);
    for (const method of (match[3] ?? '').split(', ')) {
      // HEAD mirrors GET, and the catch-all `*` is the CORS preflight handler.
      if (method === 'HEAD' || path.includes('*')) continue;
      found.push({ method, url: path });
    }
  }
  return found;
}
