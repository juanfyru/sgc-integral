export default function Inicio() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-sm font-medium uppercase tracking-widest text-green-700">
        ESE Hospital Nuestra Señora de Fátima de Suaza
      </p>
      <h1 className="text-3xl font-bold text-blue-900 sm:text-4xl">
        SGC Documental
      </h1>
      <p className="max-w-md text-balance text-muted-foreground">
        Sistema de gestión documental de calidad — NTC ISO 9001:2015. Aquí
        vivirá el mapa de procesos interactivo (Fase 3).
      </p>
      <p className="text-xs text-muted-foreground">
        Comprometidos con la <span className="font-semibold text-green-700">vida</span> y
        el <span className="font-semibold text-green-700">bienestar</span> de nuestra
        comunidad
      </p>
    </main>
  );
}
