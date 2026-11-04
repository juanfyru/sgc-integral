import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { iniciarTotpAccion, salir } from "@/app/acciones-cuenta";
import { FormularioDesactivarTotp, PanelSegundoFactor } from "@/componentes/cuenta/PanelSegundoFactor";
import { obtenerSecretoTotp } from "@/db/consultas/autenticacion";
import { obtenerMarca } from "@/db/consultas/entidad";
import { descifrar } from "@/lib/cifrado";
import { pendienteDeCuenta, puedeDesactivarTotp, rutaDePendiente } from "@/lib/cuenta-estado";
import { exigirSesionConPendientes } from "@/lib/paginas";
import { uriTotp } from "@/lib/totp";

export const metadata: Metadata = { title: "Segundo factor — SGC Integral" };
export const dynamic = "force-dynamic";

const CLASE_BOTON =
  "rounded-xl bg-azul px-4 py-2 font-medium text-white transition-colors hover:bg-azul-profundo focus-visible:ring-2 focus-visible:ring-azul/40";

function enGrupos(secreto: string): string {
  return secreto.replace(/(.{4})/g, "$1 ").trim();
}

export default async function PaginaSegundoFactor({
  searchParams,
}: {
  searchParams: Promise<{ obligatorio?: string }>;
}) {
  const { obligatorio } = await searchParams;
  const sesion = await exigirSesionConPendientes();
  // Este paso se permite con el TOTP obligatorio pendiente; los demás pasos van antes.
  const pendiente = pendienteDeCuenta(sesion);
  if (pendiente && pendiente !== "totp_obligatorio") redirect(rutaDePendiente(pendiente));

  const { secretoCifrado, activo } = await obtenerSecretoTotp(sesion.usuarioId);
  const exigido = pendiente === "totp_obligatorio" || obligatorio === "1";

  // Toda rama de `contenido` es un <PanelSegundoFactor> como único elemento raíz: al confirmar,
  // la acción revalida el layout y la página pasa a «activo»; si el panel cambiara de tipo o de
  // posición se desmontaría y se perderían los códigos de recuperación (estado del cliente).
  let contenido: React.ReactNode;
  if (activo) {
    contenido = (
      <PanelSegundoFactor confirmar={false}>
        <p className="text-sm text-foreground">
          El segundo factor está <strong>activo</strong>: al ingresar se le pedirá un código de su aplicación.
        </p>
        {puedeDesactivarTotp(sesion.rol) ? (
          <FormularioDesactivarTotp />
        ) : (
          <p className="text-sm text-muted-foreground">
            Su rol exige segundo factor; no puede desactivarlo.
          </p>
        )}
      </PanelSegundoFactor>
    );
  } else if (!secretoCifrado) {
    contenido = (
      <PanelSegundoFactor confirmar={false}>
        <p className="text-sm text-muted-foreground">
          Protege su cuenta con un código temporal de una aplicación de autenticación (Google
          Authenticator, Aegis, etc.).
        </p>
        <form action={iniciarTotpAccion}>
          <button type="submit" className={CLASE_BOTON}>
            Activar segundo factor
          </button>
        </form>
      </PanelSegundoFactor>
    );
  } else {
    let secreto: string | null = null;
    try {
      secreto = descifrar(secretoCifrado);
    } catch {
      console.error("No se pudo descifrar el secreto TOTP del usuario", sesion.usuarioId);
    }
    if (!secreto) {
      contenido = (
        <PanelSegundoFactor confirmar={false}>
          <p role="alert" className="text-sm text-destructive">
            No se pudo leer el segundo factor; pida al administrador que lo restablezca.
          </p>
        </PanelSegundoFactor>
      );
    } else {
      const entidad = (await obtenerMarca()).nombre;
      // PNG en data: URL (la CSP permite img-src data:); nunca SVG inyectado.
      const qr = await QRCode.toDataURL(uriTotp(secreto, sesion.usuario, entidad), { margin: 1, width: 224 });
      contenido = (
        <PanelSegundoFactor confirmar>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-foreground">
            <li>Escanee el código con su aplicación de autenticación.</li>
            <li>Escriba el código de 6 dígitos que ella muestra.</li>
          </ol>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} width={224} height={224} alt="Código QR para la app de autenticación" className="rounded-lg border border-border bg-white" />
          <p className="text-sm text-muted-foreground">
            ¿No puede escanear? Escriba esta clave en la aplicación:{" "}
            <code className="font-mono text-foreground">{enGrupos(secreto)}</code>
          </p>
        </PanelSegundoFactor>
      );
    }
  }

  return (
    <>
      <div className="text-center">
        <h1 className="font-display text-2xl font-semibold">Segundo factor</h1>
        {exigido && !activo && (
          <p role="alert" className="mt-2 text-sm text-foreground">
            Su rol exige segundo factor. Actívelo para continuar.
          </p>
        )}
      </div>
      <div className="flex w-full flex-col gap-4">{contenido}</div>
      {exigido && !activo ? (
        <form action={salir}>
          <button type="submit" className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-azul">
            Salir
          </button>
        </form>
      ) : (
        <Link href="/cuenta" className="text-sm text-azul underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-azul/40">
          Volver a Mi cuenta
        </Link>
      )}
    </>
  );
}
