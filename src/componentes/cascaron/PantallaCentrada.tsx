import { obtenerMarcaSegura } from "@/db/consultas/entidad";
import { Monograma } from "./Monograma";

/** Ingreso, segundo factor y pasos de la cuenta: sin cascarón, con la marca de la entidad. */
export async function PantallaCentrada({ children, pie = true }: { children: React.ReactNode; pie?: boolean }) {
  const marca = await obtenerMarcaSegura();
  const logoUrl = marca.logo ? `/marca/logo?v=${marca.logo.version}` : null;
  return (
    <main
      id="contenido"
      tabIndex={-1}
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-6 px-4 py-8 outline-none"
    >
      <div className="flex flex-col items-center gap-3 text-center">
        {logoUrl ? (
          // El logo lo sirve la propia app (/marca/logo); next/image exigiría sharp.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="size-16 rounded-xl object-contain" />
        ) : (
          <Monograma sigla={marca.sigla} className="size-16 rounded-xl text-base" />
        )}
        <p className="font-display text-lg font-semibold leading-tight text-foreground">{marca.nombre}</p>
      </div>
      {children}
      {pie && <p className="text-xs text-texto-terciario">Plataforma SGC Integral</p>}
    </main>
  );
}
