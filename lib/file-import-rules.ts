import path from "node:path";

export function shouldSkipDirectory(name: string) {
  return name.startsWith(".") || name === "__MACOSX" || name.toLowerCase() === "node_modules";
}

export function shouldSkipFile(name: string) {
  const normalized = name.toLowerCase();
  return normalized === ".ds_store" || normalized === "thumbs.db" ||
    normalized === "desktop.ini" || normalized.startsWith("~$");
}

export function guessMimeType(fileName: string) {
  const mimeTypes: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
    ".pdf": "application/pdf",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".xls": "application/vnd.ms-excel",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".txt": "text/plain"
  };

  return mimeTypes[path.extname(fileName).toLowerCase()] ?? "application/octet-stream";
}
