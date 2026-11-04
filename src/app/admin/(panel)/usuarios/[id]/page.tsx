import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  cambiarActivoAccion,
  desbloquearAccion,
  editarUsuarioAccion,
  quitarFactorAccion,
  restablecerClaveAccion,
} from "@/app/admin/acciones-usuarios";
import { FormAccion } from "@/componentes/admin/FormAccion";
import { BotonRestablecer } from "@/componentes/admin/usuarios/BotonRestablecer";
import { FormularioUsuario } from "@/componentes/admin/usuarios/FormularioUsuario";
import { obtenerUsuario, opcionesFormularioUsuario } from "@/db/consultas/usuarios";
import { exigirPermiso } from "@/lib/paginas";
import { zonaHoraria } from "@/lib/zona-horaria";
import { puede } from "@/lib/permisos";
import { ETIQUETA_ROL } from "@/lib/roles";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Usuario — Administración SGC" };

const fecha = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: zonaHoraria() });
const f = (iso: string | null) => (iso ? fecha.format(new Date(iso)) : "—");

export default async function PaginaUsuario({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await exigirPermiso("usuarios.administrar");
  const id = Number((await params).id);
  const u = Number.isInteger(id) && id > 0 ? await obtenerUsuario(id) : null;
  if (!u) notFound();
  const opciones = await opcionesFormularioUsuario(u);
  const esYo = u.id === sesion.usuarioId;

  return (
    <main className="flex flex-col gap-8">
      <div>
        <Link href="/admin/usuarios" className="text-sm text-azul underline">Usuarios</Link>
        <h1 className="mt-1 font-display text-2xl font-semibold">{u.nombre}</h1>
        <p className="text-sm text-muted-foreground">
          {u.usuario} · {ETIQUETA_ROL[u.rol]} · {u.activo ? "Activo" : "Inactivo"}
          {u.bloqueadoHasta && ` · Bloqueado hasta ${f(u.bloqueadoHasta)}`}
        </p>
      </div>

      <section aria-labelledby="titulo-estado">
        <h2 id="titulo-estado" className="mb-2 font-display text-lg font-semibold">Estado de la cuenta</h2>
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div><dt className="inline font-medium">Creado: </dt><dd className="inline">{f(u.creadoEn)}</dd></div>
          <div><dt className="inline font-medium">Segundo factor: </dt><dd className="inline">{u.totpActivo ? "Activo" : "No activo"}</dd></div>
          <div><dt className="inline font-medium">Cambio de clave pendiente: </dt><dd className="inline">{u.debeCambiarClave ? "Sí" : "No"}</dd></div>
          <div><dt className="inline font-medium">Aviso de datos aceptado: </dt><dd className="inline">{f(u.aceptoDatosEn)}</dd></div>
          <div><dt className="inline font-medium">Sesiones activas: </dt><dd className="inline">{u.sesionesActivas}</dd>
            {puede(sesion, "sesiones.administrar") && (
              <> · <Link href="/admin/sesiones" className="text-azul underline">Ver sesiones</Link></>
            )}
          </div>
          <div><dt className="inline font-medium">Cargo: </dt><dd className="inline">{u.cargoNombre ? `${u.cargoNombre} (${u.areaNombre})` : "—"}</dd></div>
          <div className="sm:col-span-2">
            <dt className="inline font-medium">Supervisores: </dt>
            <dd className="inline">
              {u.supervisores.length > 0
                ? u.supervisores.map((s) => s.nombre + (s.cargo ? ` (${s.cargo})` : "")).join(", ")
                : "—"}
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="titulo-acciones" className="flex max-w-lg flex-col gap-3">
        <h2 id="titulo-acciones" className="font-display text-lg font-semibold">Acciones</h2>
        {u.activo ? (
          esYo ? (
            <p className="text-sm text-muted-foreground">No puede desactivar su propia cuenta.</p>
          ) : (
            <FormAccion
              accion={cambiarActivoAccion}
              etiqueta="Desactivar usuario"
              confirmacion="La persona no podrá ingresar y se cerrarán sus sesiones. Su historial se conserva."
              campos={{ id: u.id, activo: "false" }}
              tono="peligro"
            />
          )
        ) : (
          <FormAccion
            accion={cambiarActivoAccion}
            etiqueta="Reactivar usuario"
            campos={{ id: u.id, activo: "true" }}
          />
        )}
        {u.bloqueadoHasta && (
          <FormAccion accion={desbloquearAccion} etiqueta="Desbloquear" campos={{ id: u.id }} />
        )}
        {u.totpActivo && !esYo && (
          <FormAccion
            accion={quitarFactorAccion}
            etiqueta="Quitar segundo factor"
            confirmacion="La persona podrá ingresar solo con su clave hasta que vuelva a activarlo."
            campos={{ id: u.id }}
            tono="peligro"
          />
        )}
        {/*
          BotonRestablecer conserva la clave temporal tras la revalidación (restablecer quita el
          bloqueo y «Desbloquear» desaparece) porque sigue en la misma posición entre sus hermanos:
          cada condicional de arriba ocupa siempre su hueco (`&&` deja un `false`). Si esta sección
          se arma como lista con `filter` o `push` (las posiciones se corren), o la rama del botón
          pasa a un ternario cuyo tipo cambie tras la acción, el componente se desmonta y la clave
          se pierde, como pasó con los códigos de recuperación.
        */}
        {esYo ? (
          <p className="text-sm text-muted-foreground">
            Para cambiar su clave o su segundo factor use Mi cuenta.
          </p>
        ) : (
          <BotonRestablecer accion={restablecerClaveAccion} id={u.id} usuario={u.usuario} />
        )}
      </section>

      <section aria-labelledby="titulo-editar">
        <h2 id="titulo-editar" className="mb-4 font-display text-lg font-semibold">Datos y permisos</h2>
        <FormularioUsuario accion={editarUsuarioAccion} id={u.id} valores={u} {...opciones} />
      </section>
    </main>
  );
}
