import { createRemoteJWKSet, jwtVerify } from "jose";

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

/**
 * Verifies a Privy access token (ES256 JWT) against the app's JWKS.
 * Returns the Privy user id (the `sub` claim, a did:privy:... string).
 */
export async function verifyPrivyToken(appId: string, accessToken: string): Promise<string> {
  let jwks = jwksCache.get(appId);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`https://auth.privy.io/api/v1/apps/${appId}/jwks.json`));
    jwksCache.set(appId, jwks);
  }
  const { payload } = await jwtVerify(accessToken, jwks, {
    issuer: "privy.io",
    audience: appId,
  });
  if (typeof payload.sub !== "string" || payload.sub.length === 0) {
    throw new Error("privy token has no subject");
  }
  return payload.sub;
}
