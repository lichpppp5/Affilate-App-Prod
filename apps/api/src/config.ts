export interface AppConfig {
  appName: string;
  port: number;
  environment: string;
  databaseUrl: string;
  authSecret: string;
  apiBaseUrl: string;
  webBaseUrl: string;
}

export function loadConfig(): AppConfig {
  return {
    appName: "appaffilate-api",
    port: Number(process.env.PORT ?? 4000),
    environment: process.env.NODE_ENV ?? "development",
    databaseUrl:
      process.env.DATABASE_URL ??
      "postgres://appaffilate:appaffilate@localhost:5432/appaffilate",
    authSecret: process.env.AUTH_SECRET ?? "dev-auth-secret",
    apiBaseUrl: process.env.API_BASE_URL ?? "http://localhost:4000",
    webBaseUrl: process.env.WEB_BASE_URL ?? "http://localhost:3000"
  };
}
