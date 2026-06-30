export type Env = {
  DB: D1Database;
  SESSIONS: KVNamespace;
  ASSETS: Fetcher;
};

export type SessionPayload = {
  userId: "owner"; // tek kullanıcı
  createdAt: number;
};

export type AppContext = {
  Bindings: Env;
  Variables: {
    session?: SessionPayload;
  };
};
