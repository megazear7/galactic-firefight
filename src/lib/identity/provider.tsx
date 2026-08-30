import { Auth0Provider, useAuth0 } from "@auth0/auth0-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getIdentityConfig, IDENTITY_AUDIENCE } from "./config";
import { UserDataClient } from "./megazear-users";

export type IdentityUser = {
  id: string;
  email?: string;
  name?: string;
};

type IdentityValue = {
  ready: boolean;
  configured: boolean;
  isAuthenticated: boolean;
  user: IdentityUser | null;
  client: UserDataClient | null;
  login: () => void;
  logout: () => void;
};

const IdentityContext = createContext<IdentityValue | null>(null);

function GuestIdentity({ children }: { children: ReactNode }) {
  const value = useMemo<IdentityValue>(
    () => ({
      ready: true,
      configured: false,
      isAuthenticated: false,
      user: null,
      client: null,
      login: () => {},
      logout: () => {},
    }),
    [],
  );
  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>;
}

function Auth0Bridge({ children }: { children: ReactNode }) {
  const cfg = getIdentityConfig();
  const {
    isLoading,
    isAuthenticated,
    user,
    loginWithRedirect,
    logout,
    getAccessTokenSilently,
    getIdTokenClaims,
  } = useAuth0();

  const client = useMemo(() => {
    if (!isAuthenticated) return null;
    return new UserDataClient({
      baseUrl: cfg.dataUrl,
      getToken: () =>
        getAccessTokenSilently({
          authorizationParams: { audience: cfg.audience || IDENTITY_AUDIENCE },
        }),
      getIdToken: async () => {
        const claims = await getIdTokenClaims();
        return claims?.__raw;
      },
    });
  }, [cfg.audience, cfg.dataUrl, getAccessTokenSilently, getIdTokenClaims, isAuthenticated]);

  const login = useCallback(() => {
    void loginWithRedirect();
  }, [loginWithRedirect]);

  const signOut = useCallback(() => {
    logout({ logoutParams: { returnTo: window.location.origin } });
  }, [logout]);

  const value = useMemo<IdentityValue>(
    () => ({
      ready: !isLoading,
      configured: true,
      isAuthenticated,
      user: user?.sub
        ? { id: user.sub, email: user.email, name: user.name }
        : null,
      client,
      login,
      logout: signOut,
    }),
    [client, isAuthenticated, isLoading, login, signOut, user],
  );

  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>;
}

export function IdentityProvider({ children }: { children: ReactNode }) {
  const cfg = getIdentityConfig();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!cfg.configured || !mounted) {
    return <GuestIdentity>{children}</GuestIdentity>;
  }
  return (
    <Auth0Provider
      domain={cfg.domain}
      clientId={cfg.clientId}
      authorizationParams={{
        redirect_uri: typeof window !== "undefined" ? window.location.origin : undefined,
        audience: cfg.audience,
      }}
      cacheLocation="localstorage"
    >
      <Auth0Bridge>{children}</Auth0Bridge>
    </Auth0Provider>
  );
}

export function useIdentity() {
  const ctx = useContext(IdentityContext);
  if (!ctx) {
    throw new Error("useIdentity must be used within IdentityProvider");
  }
  return ctx;
}
