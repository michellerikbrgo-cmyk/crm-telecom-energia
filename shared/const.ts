export const COOKIE_NAME = "app_session_id";
/** Entradas do log de actualização deixam de ser mostradas / mantidas após este período a partir de `at`. */
export const RELEASE_LOG_RETENTION_DAYS = 15;
/** Sugestões Beta concluídas são removidas da BD após este período a partir da conclusão (alinhado com `purgeStaleCompletedBetaSuggestions`). */
export const BETA_COMPLETED_RETENTION_DAYS = 15;
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';
