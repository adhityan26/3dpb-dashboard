import { timingSafeEqual } from "node:crypto";
import type { FastifyRequest, FastifyReply } from "fastify";
import { ensureApiToken, PinRateLimiter, type CredentialStore, type CredentialBlob, type Logger } from "@3pb/agent-core";

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function createAuthHook(store: CredentialStore<CredentialBlob>, logger: Logger) {
  // Instance TERPISAH dari PinRateLimiter yang dipakai LocalBroker untuk MQTT -- trustLoopback:false
  // di sini SENGAJA, beda dari broker (di mana loopback = reporter/publishLayout milik proses
  // sendiri, aman diistimewakan). Di HTTP, "loopback" bisa berarti reverse proxy/tunnel di depan
  // port 8080 yang membuat semua request tampak loopback -- limiter harus tetap berlaku.
  const rateLimiter = new PinRateLimiter({ trustLoopback: false });

  return async function authHook(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const header = req.headers.authorization;
    const presented = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
    const expectedToken = await ensureApiToken(store, logger);
    const addr = req.ip;

    const { ok, locked } = rateLimiter.check(addr, presented, expectedToken);
    if (locked) {
      reply.code(401).send({ error: "too many failed attempts, locked out temporarily" });
      return;
    }
    if (!ok || !constantTimeEqual(presented, expectedToken)) {
      reply.code(401).send({ error: "invalid or missing token" });
      return;
    }
  };
}
