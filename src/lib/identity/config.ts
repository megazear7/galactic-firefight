export const MEGAZEAR_APP = "galactic-firefight";
export const IDENTITY_AUDIENCE = "https://identity.megazear7.com";
export const IDENTITY_DATA_URL = "https://identity.megazear7.com/data";

export type IdentityConfig = {
  configured: boolean;
  domain: string;
  clientId: string;
  audience: string;
  dataUrl: string;
};

export function getIdentityConfig(): IdentityConfig {
  const domain = (import.meta.env.VITE_AUTH0_DOMAIN ?? "").trim();
  const clientId = (import.meta.env.VITE_AUTH0_CLIENT_ID ?? "").trim();
  const audience = (import.meta.env.VITE_AUTH0_AUDIENCE ?? IDENTITY_AUDIENCE).trim();
  const dataUrl = (import.meta.env.VITE_IDENTITY_URL ?? IDENTITY_DATA_URL).trim();
  return {
    configured: Boolean(domain && clientId),
    domain,
    clientId,
    audience,
    dataUrl,
  };
}
