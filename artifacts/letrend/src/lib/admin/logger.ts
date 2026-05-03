type AdminLogEntry = {
  route: string;
  user_id: string | null;
  duration_ms: number;
  status: number;
  method?: string;
};

type AdminClientErrorEntry = {
  message: string;
  context?: Record<string, unknown>;
};

export function logAdminRoute(entry: AdminLogEntry) {
  console.info(
    JSON.stringify({
      level: 'info',
      area: 'admin',
      ...entry,
    }),
  );
}

export function logAdminClientError(entry: AdminClientErrorEntry) {
  console.error(
    JSON.stringify({
      level: 'error',
      area: 'admin-client',
      ...entry,
    }),
  );
}
