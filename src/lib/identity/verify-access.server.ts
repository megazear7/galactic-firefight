import { createRemoteJWKSet, jwtVerify } from "jose";
import { getIdentityConfig } from "./config";

export type IdentityCaller = {
  userId: string;
};

function bearerToken(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) return "";
  return header.slice(7).trim();
}

function issuerFor(domain: string) {
  const host = domain.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  return `https://${host}/`;
}

/**
 * Verify the Megazear/Auth0 access token the SPA already sends to identity.
 * Returns null when identity is not configured or the token is missing/invalid.
 */
export async function identityCallerFromRequest(req: Request): Promise<IdentityCaller | null> {
  const cfg = getIdentityConfig();
  if (!cfg.domain || !cfg.audience) return null;
  const token = bearerToken(req);
  if (!token) return null;
  try {
    const issuer = issuerFor(cfg.domain);
    const getKey = createRemoteJWKSet(new URL(`${issuer}.well-known/jwks.json`));
    const { payload } = await jwtVerify(token, getKey, {
      issuer,
      audience: cfg.audience,
    });
    if (typeof payload.sub !== "string" || !payload.sub) return null;
    return { userId: payload.sub };
  } catch {
    return null;
  }
}
