import { NextRequest } from "next/server";
import { expect, it, vi } from "vitest";

// Con sesion simulada: el DELETE debe rechazar un Origin ajeno ANTES de tocar la BD.
vi.mock("@/lib/sesion-actual", () => ({
  sesionDePeticion: async () => ({ usuarioId: 1, rol: "admin_sgc" }),
}));

import { DELETE } from "@/app/admin/api/archivos/[archivoId]/route";

it("DELETE de archivo con Origin ajeno responde 403 aun con sesion", async () => {
  const peticion = new NextRequest("http://sgc.local/admin/api/archivos/1", {
    method: "DELETE",
    headers: { host: "sgc.local", origin: "https://malo.com" },
  });
  const res = await DELETE(peticion, { params: Promise.resolve({ archivoId: "1" }) });
  expect(res.status).toBe(403);
  expect(await res.json()).toEqual({ error: "Origen no permitido" });
});
