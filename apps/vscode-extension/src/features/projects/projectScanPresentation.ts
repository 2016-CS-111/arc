import type { ProjectScan } from "@arc/contracts";

export interface ProjectScanPresentation {
  readonly background: "warning" | "error" | null;
  readonly completionMessage: string | null;
  readonly text: string;
  readonly tooltip: string;
}

export function createProjectScanPresentation(scan: ProjectScan | null): ProjectScanPresentation {
  if (scan === null) {
    return {
      background: null,
      completionMessage: null,
      text: "$(database) Arc: Not scanned",
      tooltip: "Arc has no repository inventory for this workspace.",
    };
  }

  switch (scan.status) {
    case "running":
      return {
        background: null,
        completionMessage: null,
        text: "$(sync~spin) Arc: Scanning",
        tooltip: "Arc is scanning repository metadata.",
      };
    case "completed":
      return {
        background: null,
        completionMessage: `Arc inventoried ${String(scan.fileCount)} files.`,
        text: `$(database) Arc: ${String(scan.fileCount)} files`,
        tooltip: `${String(scan.fileCount)} files, ${formatBytes(scan.totalBytes)}, scanned ${formatTimestamp(scan.completedAt)}.`,
      };
    case "limited":
      return {
        background: "warning",
        completionMessage: `Arc inventoried ${String(scan.fileCount)} files and reached configured limits.`,
        text: `$(warning) Arc: ${String(scan.fileCount)} files`,
        tooltip: `Inventory limited by ${scan.limitReasons.join(", ")}.`,
      };
    case "failed":
      return {
        background: "error",
        completionMessage: "Arc repository inventory failed.",
        text: "$(error) Arc: Scan failed",
        tooltip:
          scan.errorCode === "scan_interrupted"
            ? "The previous Arc scan was interrupted by a backend restart."
            : "The latest Arc repository inventory failed.",
      };
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${String(bytes)} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KiB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function formatTimestamp(timestamp: string | null): string {
  return timestamp === null ? "now" : new Date(timestamp).toLocaleString();
}
