import { z } from "zod";
import { api } from "./api";
import { fileSchema } from "./contracts";

const stateSchema = z.object({ id: z.string(), next_part: z.number() });
import { textChunks } from "./source-files";

export async function uploadSource(
  projectId: string,
  path: string,
  source: string,
  revision?: number,
) {
  const upload = await api("/uploads", stateSchema, {
    method: "POST",
    body: { project_id: projectId, path, revision },
  });
  let parts = 0;
  try {
    for (const content of textChunks(source)) {
      await api(`/uploads/${upload.id}/parts`, stateSchema, {
        method: "PUT",
        body: { part: parts, content },
      });
      parts++;
    }
    return await api(`/uploads/${upload.id}/finish`, fileSchema, {
      method: "POST",
      body: { parts },
    });
  } catch (error) {
    await api(`/uploads/${upload.id}`, z.object({ ok: z.boolean() }), {
      method: "DELETE",
    }).catch(() => undefined);
    throw error;
  }
}
