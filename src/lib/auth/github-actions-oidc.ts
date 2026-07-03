const GITHUB_ACTIONS_OIDC_ISSUER = "https://token.actions.githubusercontent.com";
const GITHUB_ACTIONS_JWKS_URL = `${GITHUB_ACTIONS_OIDC_ISSUER}/.well-known/jwks`;
const EXPECTED_AUDIENCE = "portfoliotrack-cron";
const EXPECTED_REPOSITORY = "inspirezuza/portfoliotrack";
const EXPECTED_REF = "refs/heads/main";
const EXPECTED_WORKFLOW_REF = `${EXPECTED_REPOSITORY}/.github/workflows/market-refresh.yml@${EXPECTED_REF}`;
const CLOCK_TOLERANCE_SECONDS = 60;

type JwtHeader = {
  alg?: unknown;
  kid?: unknown;
};

type GitHubJwk = JsonWebKey & {
  kid?: string;
};

type GitHubJwks = {
  keys?: GitHubJwk[];
};

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const [scheme, token] = authorization.split(" ");

  return scheme.toLowerCase() === "bearer" && token ? token : null;
}

function decodeBase64UrlJson(value: string): unknown {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

function getNumericClaim(claims: Record<string, unknown>, name: string) {
  const value = claims[name];

  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function audienceMatches(audience: unknown) {
  if (typeof audience === "string") {
    return audience === EXPECTED_AUDIENCE;
  }

  return Array.isArray(audience) && audience.includes(EXPECTED_AUDIENCE);
}

function hasValidEventName(value: unknown) {
  return value === "schedule" || value === "workflow_dispatch";
}

export function validateGitHubActionsCronClaims(claims: Record<string, unknown>, now = new Date()) {
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const expiresAt = getNumericClaim(claims, "exp");
  const notBefore = getNumericClaim(claims, "nbf");

  return (
    claims.iss === GITHUB_ACTIONS_OIDC_ISSUER &&
    audienceMatches(claims.aud) &&
    claims.repository === EXPECTED_REPOSITORY &&
    claims.ref === EXPECTED_REF &&
    claims.job_workflow_ref === EXPECTED_WORKFLOW_REF &&
    hasValidEventName(claims.event_name) &&
    expiresAt != null &&
    expiresAt + CLOCK_TOLERANCE_SECONDS >= nowSeconds &&
    (notBefore == null || notBefore - CLOCK_TOLERANCE_SECONDS <= nowSeconds)
  );
}

async function getJwkForKeyId(keyId: string) {
  const response = await fetch(GITHUB_ACTIONS_JWKS_URL);

  if (!response.ok) {
    return null;
  }

  const jwks = (await response.json()) as GitHubJwks;

  return jwks.keys?.find((key) => key.kid === keyId && key.kty === "RSA") ?? null;
}

async function verifyJwtSignature({
  encodedHeader,
  encodedPayload,
  encodedSignature,
  jwk,
}: {
  encodedHeader: string;
  encodedPayload: string;
  encodedSignature: string;
  jwk: JsonWebKey;
}) {
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    {
      hash: "SHA-256",
      name: "RSASSA-PKCS1-v1_5",
    },
    false,
    ["verify"],
  );
  const signedPayload = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);
  const signature = Buffer.from(encodedSignature, "base64url");

  return crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, signedPayload);
}

export async function verifyGitHubActionsCronToken(token: string, now = new Date()) {
  try {
    const [encodedHeader, encodedPayload, encodedSignature] = token.split(".");

    if (!encodedHeader || !encodedPayload || !encodedSignature) {
      return false;
    }

    const header = decodeBase64UrlJson(encodedHeader) as JwtHeader;

    if (header.alg !== "RS256" || typeof header.kid !== "string") {
      return false;
    }

    const jwk = await getJwkForKeyId(header.kid);

    if (jwk == null) {
      return false;
    }

    const signatureIsValid = await verifyJwtSignature({
      encodedHeader,
      encodedPayload,
      encodedSignature,
      jwk,
    });

    if (!signatureIsValid) {
      return false;
    }

    const claims = decodeBase64UrlJson(encodedPayload) as Record<string, unknown>;

    return validateGitHubActionsCronClaims(claims, now);
  } catch {
    return false;
  }
}

export async function isAuthorizedGitHubActionsCronRequest(request: Request) {
  const token = getBearerToken(request);

  return token == null ? false : verifyGitHubActionsCronToken(token);
}
