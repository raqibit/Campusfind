import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from "jose";
import { AppError } from "../lib/errors.js";
import { env } from "../config/env.js";

export type OAuthProvider = "google" | "apple";

const keySets = {
  google: createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs")),
  apple: createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys")),
};

function providerClientId(provider: OAuthProvider) {
  const id = provider === "google" ? env.GOOGLE_CLIENT_ID : env.APPLE_CLIENT_ID;
  if (!id) throw new AppError(503, `${provider === "google" ? "Google" : "Apple"} sign-in is not configured.`, "OAUTH_NOT_CONFIGURED");
  return id;
}

export function providerAuthorizationUrl(provider: OAuthProvider, state: string, nonce: string) {
  const clientId = providerClientId(provider);
  const redirectUri = `${(env.AUTH_CALLBACK_URL || `${env.API_PUBLIC_URL}/api/auth/oauth`).replace(/\/+$/, "")}/${provider}/callback`;
  const url = new URL(provider === "google"
    ? "https://accounts.google.com/o/oauth2/v2/auth"
    : "https://appleid.apple.com/auth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", provider === "google" ? "openid email profile" : "openid email");
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  if (provider === "apple") url.searchParams.set("response_mode", "form_post");
  return url.toString();
}

async function appleClientSecret() {
  if (!env.APPLE_TEAM_ID || !env.APPLE_KEY_ID || !env.APPLE_PRIVATE_KEY || !env.APPLE_CLIENT_ID) {
    throw new AppError(503, "Apple sign-in is not configured.", "OAUTH_NOT_CONFIGURED");
  }
  const privateKey = await importPKCS8(env.APPLE_PRIVATE_KEY.replace(/\\n/g, "\n"), "ES256");
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: env.APPLE_KEY_ID })
    .setIssuer(env.APPLE_TEAM_ID)
    .setSubject(env.APPLE_CLIENT_ID)
    .setAudience("https://appleid.apple.com")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

export async function exchangeOAuthCode(provider: OAuthProvider, code: string) {
  const clientId = providerClientId(provider);
  const redirectUri = `${(env.AUTH_CALLBACK_URL || `${env.API_PUBLIC_URL}/api/auth/oauth`).replace(/\/+$/, "")}/${provider}/callback`;
  const form = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
  });
  if (provider === "google") {
    if (!env.GOOGLE_CLIENT_SECRET) throw new AppError(503, "Google sign-in is not configured.", "OAUTH_NOT_CONFIGURED");
    form.set("client_secret", env.GOOGLE_CLIENT_SECRET);
  } else {
    form.set("client_secret", await appleClientSecret());
  }
  const response = await fetch(provider === "google" ? "https://oauth2.googleapis.com/token" : "https://appleid.apple.com/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await response.json() as { id_token?: string; error?: string };
  if (!response.ok || !payload.id_token) throw new AppError(401, "The identity provider could not verify this sign-in.", "OAUTH_CODE_EXCHANGE_FAILED");
  return payload.id_token;
}

export async function verifyProviderIdToken(provider: OAuthProvider, token: string, nonce: string) {
  const clientId = providerClientId(provider);
  const issuer = provider === "google" ? ["https://accounts.google.com", "accounts.google.com"] : "https://appleid.apple.com";
  const { payload } = await jwtVerify(token, keySets[provider], {
    algorithms: ["RS256"],
    audience: clientId,
    issuer,
  });
  if (payload.nonce !== nonce || typeof payload.sub !== "string" || !payload.sub) {
    throw new AppError(401, "The identity response did not match this sign-in request.", "OAUTH_TOKEN_INVALID");
  }
  const email = typeof payload.email === "string" ? payload.email.toLowerCase() : null;
  const emailVerified = payload.email_verified === true || payload.email_verified === "true";
  const fullName = typeof payload.name === "string" ? payload.name : undefined;
  if (email && !emailVerified) throw new AppError(403, "The identity provider did not verify this email address.", "OAUTH_EMAIL_UNVERIFIED");
  return { subject: payload.sub, email, emailVerified, fullName };
}
