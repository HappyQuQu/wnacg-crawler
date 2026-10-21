import type { LibraryItem } from "./types";

export function isLibraryActive(item: LibraryItem): boolean {
  return ["pending", "queued", "running", "paused"].includes(item.task_status || "")
    || ["pending", "queued", "running", "paused"].includes(item.status);
}

export function libraryNeedsAttention(item: LibraryItem): boolean {
  return !isLibraryActive(item) && (["partial", "failed", "missing"].includes(item.status)
    || item.missing_files > 0 || item.failed_files > 0);
}

export function canDownloadLibrary(item: LibraryItem): boolean {
  return !isLibraryActive(item) && item.total_files > 0 && item.valid_files === item.total_files;
}
