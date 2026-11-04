"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Boton } from "@/componentes/ui/Boton";
import { claseControl } from "@/componentes/ui/Campo";
import { LOGO_MAX_BYTES, LOGO_MAX_LADO, LOGO_MIN_LADO } from "@/lib/logo-limites";


type Mensaje = { tipo: "ok" | "error"; texto: string } | null;

export function CargaLogo({ logo }: { logo: { version: string; mime: string } | null }) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [mensaje, setMensaje] = useState<Mensaje>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function enviar(metodo: "POST" | "DELETE", cuerpo?: FormData, exito = "Cambios guardados") {
    setOcupado(true);
    try {
      const r = await fetch("/admin/api/entidad/logo", { method: metodo, body: cuerpo });
      const datos = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        setMensaje({
          tipo: "error",
          texto:
            r.status === 401
              ? "Su sesión terminó; vuelva a ingresar"
              : (datos.error ?? "No se pudo completar la operación"),
        });
        return;
      }
      setMensaje({ tipo: "ok", texto: exito });
      router.refresh();
    } catch {
      setMensaje({ tipo: "error", texto: "No se pudo conectar con el servidor" });
    } finally {
      // También tras un error: así se puede reintentar con el mismo archivo.
      if (entrada.current) entrada.current.value = "";
      setOcupado(false);
    }
  }

  function alElegir(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    if (archivo.size > LOGO_MAX_BYTES) {
      // Aviso previo; igualmente se envía para mostrar también el error del servidor.
      // Redondeo hacia arriba: 1 MB + 1 byte se lee «1,1 MB», no «1,0 MB».
      const mb = (Math.ceil(archivo.size / 104857.6) / 10).toFixed(1).replace(".", ",");
      setAviso(`El archivo pesa ${mb} MB; el máximo es 1 MB.`);
    } else {
      setAviso(null);
    }
    setMensaje(null);
    const cuerpo = new FormData();
    cuerpo.set("archivo", archivo);
    void enviar("POST", cuerpo, "Logo actualizado");
  }

  return (
    <section aria-labelledby="titulo-logo" className="space-y-3">
      <h2 id="titulo-logo" className="text-sm font-semibold">
        Logo
      </h2>
      <div className="flex min-h-24 items-center justify-center rounded-lg border border-border bg-card p-4">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/marca/logo?v=${logo.version}`} alt="Logo actual de la entidad" className="max-h-24 max-w-full object-contain" />
        ) : (
          <p className="text-sm text-muted-foreground">Sin logo: se muestra el monograma con la sigla.</p>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="archivo-logo" className="text-sm font-medium">
          Subir logo
        </label>
        <input
          ref={entrada}
          id="archivo-logo"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={ocupado}
          onChange={alElegir}
          className={claseControl}
          aria-describedby="ayuda-logo"
        />
        <p id="ayuda-logo" className="text-xs text-muted-foreground">
          PNG, JPG o WebP, hasta 1 MB y entre {LOGO_MIN_LADO} y {LOGO_MAX_LADO} píxeles por lado.
        </p>
      </div>
      {logo ? (
        <Boton variante="secundario" tamano="sm" pendiente={ocupado} onClick={() => { setAviso(null); void enviar("DELETE", undefined, "Logo quitado"); }}>
          Quitar logo
        </Boton>
      ) : null}
      {aviso ? (
        <p role="status" className="text-sm text-estado-atencion-texto">
          {aviso}
        </p>
      ) : null}
      {mensaje ? (
        <p
          role={mensaje.tipo === "error" ? "alert" : "status"}
          className={`text-sm ${mensaje.tipo === "error" ? "text-estado-critico-texto" : "text-estado-bien-texto"}`}
        >
          {mensaje.texto}
        </p>
      ) : null}
    </section>
  );
}
