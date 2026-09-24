import type { MediaType, ResolvedFolder } from "./types";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
if (!BASE) {
  throw new Error("EXPO_PUBLIC_BACKEND_URL não configurada");
}

export async function resolveFolder(link: string): Promise<ResolvedFolder> {
  const res = await fetch(`${BASE}/api/drive/resolve?link=${encodeURIComponent(link)}`, {
    headers: { Accept: "application/json" },
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // non-JSON response
  }
  if (!res.ok) {
    const detail =
      body && typeof body === "object" && "detail" in body
        ? String((body as { detail: unknown }).detail)
        : "Falha ao ler a pasta do Google Drive";
    throw new Error(detail);
  }
  const data = body as {
    folder_id?: string;
    items?: Array<{ file_id?: string; name?: string; ext?: string; type?: string }>;
    source?: string;
    cached?: boolean;
  };
  const items = (data.items ?? [])
    .filter((i): i is { file_id: string; name: string; ext: string; type: string } =>
      Boolean(i && i.file_id && i.name),
    )
    .map((i) => ({
      fileId: i.file_id,
      name: i.name,
      ext: i.ext ?? "",
      type: (i.type === "video" ? "video" : "photo") as MediaType,
    }));
  return { folderId: data.folder_id ?? "", items, source: data.source ?? "drive", cached: Boolean(data.cached) };
}
