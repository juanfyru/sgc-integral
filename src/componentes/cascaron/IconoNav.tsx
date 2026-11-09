import {
  Building2,
  CalendarClock,
  ChartColumn,
  ClipboardList,
  FileText,
  Home,
  KeyRound,
  ListChecks,
  Map as Mapa,
  MapPin,
  MonitorSmartphone,
  Network,
  Scale,
  ScrollText,
  Search,
  Send,
  Settings2,
  Tags,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { IconoNav as NombreIcono } from "./navegacion";

const ICONOS: Record<NombreIcono, LucideIcon> = {
  inicio: Home,
  buscar: Search,
  tramites: ClipboardList,
  distribucion: Send,
  vigencia: CalendarClock,
  normograma: Scale,
  documentos: FileText,
  maestro: ListChecks,
  tipos: Tags,
  configuracion: Settings2,
  mapa: Mapa,
  entidad: Building2,
  estructura: Network,
  puntos: MapPin,
  listas: ListChecks,
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
