// src/components/status.ts
export const ACTIVE_STATUSES = [
  "GENERATING_CONTENT",
  "TRANSLATING",
  "GENERATING_DOCUMENTS",
  "IN_PROGRESS",
];

export const isActiveStatus = (status?: string) =>
  !!status && ACTIVE_STATUSES.includes(status);

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Queued",
  GENERATING_CONTENT: "Writing chapters",
  TRANSLATING: "Translating",
  GENERATING_DOCUMENTS: "Building ebooks",
  IN_PROGRESS: "In progress",
  COMPLETED: "Ready",
  FAILED: "Failed",
};

export const statusLabel = (status: string) =>
  STATUS_LABELS[status] || status.replace(/_/g, " ").toLowerCase();
