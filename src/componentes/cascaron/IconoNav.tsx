import {
  Building2,
  ChartColumn,
  FileText,
  Home,
  KeyRound,
  ListChecks,
  Map as Mapa,
  MonitorSmartphone,
  Network,
  ScrollText,
  Search,
  Tags,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { IconoNav as NombreIcono } from "./navegacion";

const ICONOS: Record<NombreIcono, LucideIcon> = {
  inicio: Home,
  buscar: Search,
  documentos: FileText,
  maestro: ListChecks,
  tipos: Tags,
  mapa: Mapa,
  entidad: Building2,
  estructura: Network,
  usuarios: Users,
  estadisticas: ChartColumn,
  bitacora: ScrollText,
  accesos: KeyRound,
  sesiones: MonitorSmartphone,
};

/** Ícono decorativo de una entrada de navegación: la etiqueta textual siempre va al lado. */
export function IconoNav({ nombre, className }: { nombre: NombreIcono; className?: string }) {
  const Icono = ICONOS[nombre];
  return <Icono className={className} aria-hidden="true" />;
}
