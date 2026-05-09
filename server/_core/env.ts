export const ENV = {
  /** Identificador da app no JWT (não precisa de servidor OAuth). */
  appId: process.env.VITE_APP_ID?.trim() || "crm-telecom-energia",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  /** Pasta absoluta no servidor; uploads (PDF, avatar) gravam em disco. */
  localUploadRoot: process.env.LOCAL_UPLOAD_ROOT ?? "",
  /** URL pública opcional para `storageGetSignedUrl` em modo local (ex. https://crm.exemplo.pt). */
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "",
};
