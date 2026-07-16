import {
  Award,
  Baby,
  BedDouble,
  Boxes,
  ChartColumn,
  CircleCheckBig,
  CircleDollarSign,
  ClipboardCheck,
  Clock,
  Cross,
  FileText,
  FolderOpen,
  Headset,
  HeartHandshake,
  HeartPulse,
  IterationCw,
  Landmark,
  Microscope,
  MonitorSmartphone,
  MoveHorizontal,
  MoveRight,
  Scale,
  ScrollText,
  Settings,
  ShieldAlert,
  ShieldPlus,
  ShoppingCart,
  Siren,
  Smile,
  Stethoscope,
  Target,
  TrendingUp,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

// El mapa vive en BD y guarda el ícono por nombre (kebab-case de lucide).
// Este registro traduce nombre → componente, con fallback para nombres
// desconocidos: el render nunca se rompe por un ícono mal escrito en el admin.
const REGISTRO: Record<string, LucideIcon> = {
  award: Award,
  baby: Baby,
  "bed-double": BedDouble,
  boxes: Boxes,
  "chart-column": ChartColumn,
  "circle-check-big": CircleCheckBig,
  "circle-dollar-sign": CircleDollarSign,
  "clipboard-check": ClipboardCheck,
  clock: Clock,
  cross: Cross,
  "file-text": FileText,
  "folder-open": FolderOpen,
  headset: Headset,
  "heart-handshake": HeartHandshake,
  "heart-pulse": HeartPulse,
  "iteration-cw": IterationCw,
  landmark: Landmark,
  microscope: Microscope,
  "monitor-smartphone": MonitorSmartphone,
  "move-horizontal": MoveHorizontal,
  "move-right": MoveRight,
  scale: Scale,
  "scroll-text": ScrollText,
  settings: Settings,
  "shield-alert": ShieldAlert,
  "shield-plus": ShieldPlus,
  "shopping-cart": ShoppingCart,
  siren: Siren,
  smile: Smile,
  stethoscope: Stethoscope,
  target: Target,
  "trending-up": TrendingUp,
  users: Users,
  "users-round": UsersRound,
};

export function Icono({
  nombre,
  className,
}: {
  nombre: string | null;
  className?: string;
}) {
  const Componente = (nombre && REGISTRO[nombre]) || FileText;
  return <Componente className={className} aria-hidden="true" />;
}
