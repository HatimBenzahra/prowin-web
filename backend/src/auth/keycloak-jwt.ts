import { UnauthorizedException } from '@nestjs/common';
import axios from 'axios';
import { createPublicKey, createVerify, JsonWebKey, KeyObject } from 'crypto';

/**
 * Validation locale des access tokens Keycloak (signature RS256 via JWKS).
 *
 * Remplace l'introspection (/token/introspect) : même principe que r-win.
 * Contrepartie : une session révoquée côté Keycloak reste acceptée jusqu'à
 * l'expiration du token (Access Token Lifespan, 30 min).
 */

export interface KeycloakAccessToken {
  sub: string;
  iss: string;
  exp: number;
  typ?: string;
  email?: string;
  preferred_username?: string;
  given_name?: string;
  family_name?: string;
  name?: string;
  groups?: string[];
  realm_access?: { roles?: string[] };
  resource_access?: Record<string, { roles?: string[] }>;
}

interface Jwk extends JsonWebKey {
  kid: string;
}

interface JwtHeader {
  alg?: string;
  kid?: string;
}

const CLOCK_SKEW_SECONDS = 30;
const JWKS_REFRESH_MIN_INTERVAL_MS = 60_000;

let keysByKid = new Map<string, KeyObject>();
let lastJwksFetch = 0;

function realmUrl(): string {
  return `${process.env.KEYCLOAK_BASE_URL}/realms/${process.env.KEYCLOAK_REALM}`;
}

async function loadJwks(): Promise<void> {
  const { data } = await axios.get<{ keys?: Jwk[] }>(
    `${realmUrl()}/protocol/openid-connect/certs`,
    { timeout: 5000 },
  );
  const next = new Map<string, KeyObject>();
  for (const jwk of data.keys ?? []) {
    if (jwk.kty !== 'RSA' || (jwk.use && jwk.use !== 'sig')) continue;
    next.set(jwk.kid, createPublicKey({ key: jwk, format: 'jwk' }));
  }
  keysByKid = next;
  lastJwksFetch = Date.now();
}

async function getKey(kid: string): Promise<KeyObject | undefined> {
  // Clé inconnue (rotation Keycloak) : on recharge, au plus une fois par minute
  if (
    !keysByKid.has(kid) &&
    Date.now() - lastJwksFetch > JWKS_REFRESH_MIN_INTERVAL_MS
  ) {
    await loadJwks();
  }
  return keysByKid.get(kid);
}

function decodePart<T>(part: string): T {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as T;
}

export async function verifyKeycloakToken(
  token: string,
): Promise<KeycloakAccessToken> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new UnauthorizedException('Token invalide');
  }
  const [headerB64, payloadB64, signatureB64] = parts;

  let header: JwtHeader;
  let payload: KeycloakAccessToken;
  try {
    header = decodePart<JwtHeader>(headerB64);
    payload = decodePart<KeycloakAccessToken>(payloadB64);
  } catch {
    throw new UnauthorizedException('Token invalide');
  }

  if (header.alg !== 'RS256' || !header.kid) {
    throw new UnauthorizedException('Algorithme de token non supporté');
  }

  const key = await getKey(header.kid);
  if (!key) {
    throw new UnauthorizedException('Clé de signature inconnue');
  }

  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  if (!verifier.verify(key, Buffer.from(signatureB64, 'base64url'))) {
    throw new UnauthorizedException('Signature du token invalide');
  }

  const now = Math.floor(Date.now() / 1000);
  if (
    typeof payload.exp !== 'number' ||
    payload.exp + CLOCK_SKEW_SECONDS < now
  ) {
    throw new UnauthorizedException('Token expiré');
  }
  if (payload.iss !== realmUrl()) {
    throw new UnauthorizedException('Émetteur du token invalide');
  }
  if (payload.typ && payload.typ !== 'Bearer') {
    throw new UnauthorizedException('Type de token invalide');
  }

  return payload;
}
