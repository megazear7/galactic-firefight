export type Visibility = "private" | "shared" | "public";

export type UserDataClientOptions = {
  baseUrl: string;
  getToken: () => Promise<string>;
  getIdToken?: () => Promise<string | null | undefined>;
};

export type DataLocator = {
  targetUserId?: string;
  app: string;
  visibility: Visibility;
  path: string;
};

export type PutInput = DataLocator & {
  data: unknown;
  metadata?: Record<string, string>;
};

export class UserDataError extends Error {
  status: number;
  code: string;
  body: unknown;

  constructor(status: number, code: string, message: string, body: unknown) {
    super(message);
    this.name = "UserDataError";
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

export class UserDataClient {
  constructor(private readonly opts: UserDataClientOptions) {}

  async headers(): Promise<Record<string, string>> {
    const token = await this.opts.getToken();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };
    const idToken = (await this.opts.getIdToken?.())?.trim();
    if (idToken) headers["X-ID-Token"] = idToken;
    return headers;
  }

  async get<T = unknown>(locator: DataLocator): Promise<{
    key: string;
    data: T;
    metadata: Record<string, string> | null;
  }> {
    return this.request("GET", locator) as Promise<{
      key: string;
      data: T;
      metadata: Record<string, string> | null;
    }>;
  }

  async put<T = unknown>(input: PutInput): Promise<{
    key: string;
    data: T;
    metadata: Record<string, string> | null;
  }> {
    return this.request("PUT", input, {
      data: input.data,
      metadata: input.metadata,
    }) as Promise<{
      key: string;
      data: T;
      metadata: Record<string, string> | null;
    }>;
  }

  async patch<T = unknown>(input: PutInput): Promise<{
    key: string;
    data: T;
    metadata: Record<string, string> | null;
  }> {
    return this.request("PATCH", input, {
      data: input.data,
      metadata: input.metadata,
    }) as Promise<{
      key: string;
      data: T;
      metadata: Record<string, string> | null;
    }>;
  }

  async delete(locator: DataLocator): Promise<void> {
    await this.request("DELETE", locator);
  }

  async list(locator: DataLocator): Promise<{
    prefix: string;
    keys: Array<{ key: string; path: string }>;
  }> {
    return this.request("GET", locator, undefined, { list: true }) as Promise<{
      prefix: string;
      keys: Array<{ key: string; path: string }>;
    }>;
  }

  async getAcl(app: string, targetUserId?: string) {
    return this.get({
      targetUserId,
      app,
      visibility: "private",
      path: "access",
    });
  }

  async putAcl(app: string, acl: unknown, targetUserId?: string) {
    return this.put({
      targetUserId,
      app,
      visibility: "private",
      path: "access",
      data: acl,
    });
  }

  async setPublicWriteAccess(app: string, enabled: boolean, targetUserId?: string) {
    let acl: { version: 1; updatedAt: string; entries: unknown[] } = {
      version: 1,
      updatedAt: new Date().toISOString(),
      entries: [],
    };
    try {
      const current = await this.getAcl(app, targetUserId);
      acl = current.data as typeof acl;
    } catch {
      // The first public write creates the ACL document.
    }
    return this.putAcl(app, { ...acl, publicWrite: enabled }, targetUserId);
  }

  private async request(
    method: string,
    locator: DataLocator,
    body?: { data?: unknown; metadata?: Record<string, string> },
    extraQuery?: Record<string, string | boolean>,
  ): Promise<unknown> {
    const url = new URL(this.opts.baseUrl);
    url.searchParams.set("app", locator.app);
    url.searchParams.set("visibility", locator.visibility);
    url.searchParams.set("path", locator.path);
    if (locator.targetUserId) {
      url.searchParams.set("targetUserId", locator.targetUserId);
    }
    if (extraQuery) {
      for (const [k, v] of Object.entries(extraQuery)) {
        url.searchParams.set(k, String(v));
      }
    }

    const headers = await this.headers();
    let payload: string | undefined;
    if (body && (method === "PUT" || method === "PATCH")) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify({
        targetUserId: locator.targetUserId,
        app: locator.app,
        visibility: locator.visibility,
        path: locator.path,
        data: body.data,
        metadata: body.metadata,
      });
    }

    const res = await fetch(url, { method, headers, body: payload });
    if (res.status === 204) return undefined;
    const text = await res.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { message: text };
      }
    }
    if (!res.ok) {
      const obj = (parsed ?? {}) as { error?: string; message?: string };
      throw new UserDataError(
        res.status,
        obj.error ?? "error",
        obj.message ?? res.statusText,
        parsed,
      );
    }
    return parsed;
  }
}
