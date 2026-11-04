import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FormularioCambioClave } from "@/componentes/cuenta/FormularioCambioClave";
import { obtenerPerfil } from "@/db/consultas/perfil";
import { pendienteDeCuenta, rutaDePendiente } from "@/lib/cuenta-estado";
import { exigirSesionConPendientes } from "@/lib/paginas";
import { ETIQUETA_ROL } from "@/lib/roles";
import { mensajeDeParametro } from "@/lib/rutas";

export const metadata: Metadata = { title: "Mi cuenta — SGC Integral" };
export const dynamic = "force-dynamic";

const AVISOS: Record<string, string> = {
  clave: "Su clave se cambió. Las demás sesiones abiertas se cerraron.",
  "factor-desactivado": "El segundo factor se desactivó.",
};

const ENLACE = "text-sm text-marca underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-azul/40";

export default async function PaginaMiCuenta({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string }>;
}) {
  const aviso = mensajeDeParametro(AVISOS, (await searchParams).aviso);
  const sesion = await exigirSesionConPendientes();
  const pendiente = pendienteDeCuenta(sesion);
  if (pendiente) redirect(rutaDePendiente(pendiente));
  const perfil = await obtenerPerfil(sesion.usuarioId);
  if (!perfil) redirect("/ingreso");

  const datos: Array<[string, string]> = [
    ["Nombre", perfil.nombre],
    ["Usuario", perfil.usuario],
    ["Correo", perfil.correo ?? "—"],
    ["Rol", ETIQUETA_ROL[perfil.rol]],
    ["Cargo", perfil.cargo ?? "—"],
    ["Área", perfil.area ?? "—"],
  ];

  return (
    <div className="flex w-full flex-col gap-8">
      <div>
        <Link href="/" className={ENLACE}>
          Volver al inicio
        </Link>
        <h1 className="mt-2 font-display text-2xl font-semibold">Mi cuenta</h1>
      </div>
      {aviso && (
        <p role="status" className="rounded-lg border border-border bg-muted p-3 text-sm text-foreground">
          {aviso}
        </p>
      )}

      <section aria-labelledby="mis-datos" className="flex flex-col gap-3">
        <h2 id="mis-datos" className="font-display text-lg font-semibold">Mis datos</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {datos.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="text-foreground">{v}</dd>
            </div>
          ))}
          <div className="contents">
            <dt className="text-muted-foreground">Procesos</dt>
            <dd className="text-foreground">
              {perfil.procesos.length === 0
                ? "—"
                : perfil.procesos.map((p, i) => (
                    <span key={p.id}>
                      {i > 0 && ", "}
                      <Link href={`/procesos/${p.slug}`} className="text-marca underline underline-offset-2">
                        {p.nombre}
                      </Link>
                    </span>
                  ))}
            </dd>
          </div>
          {perfil.supervisores.length > 0 && (
            <div className="contents">
              <dt className="text-muted-foreground">Supervisores</dt>
              <dd className="text-foreground">
                {perfil.supervisores.map((s) => (s.cargo ? `${s.nombre} (${s.cargo})` : s.nombre)).join(", ")}
              </dd>
            </div>
          )}
        </dl>
      </section>

      <section aria-labelledby="cambiar-clave" className="flex flex-col gap-3">
        <h2 id="cambiar-clave" className="font-display text-lg font-semibold">Cambiar clave</h2>
        <FormularioCambioClave />
      </section>

      <section aria-labelledby="segundo-factor" className="flex flex-col gap-3">
        <h2 id="segundo-factor" className="font-display text-lg font-semibold">Segundo factor</h2>
        <p className="text-sm text-foreground">
          Estado: <strong>{perfil.totpActivo ? "activo" : "no activado"}</strong>
        </p>
        <Link href="/cuenta/segundo-factor" className={ENLACE}>
          {perfil.totpActivo ? "Administrar segundo factor" : "Activar segundo factor"}
        </Link>
      </section>
    </div>
  );
}
