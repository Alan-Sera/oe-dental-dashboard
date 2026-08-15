import {
  Archive,
  BadgeDollarSign,
  ClipboardList,
  FolderDown,
  LayoutDashboard,
  Settings,
  UsersRound
} from "lucide-react";

export const navigationItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/patients", label: "Pacientes", icon: UsersRound },
  { href: "/import", label: "Importar", icon: FolderDown },
  { href: "/settings", label: "Ajustes", icon: Settings }
];

export const categoryLabels = {
  PHOTO: "Fotos",
  RADIOGRAPH: "Radiografías",
  CLINICAL_HISTORY: "Historia clínica",
  PAYMENT_RECEIPT: "Pagos",
  OTHER: "Otros"
};

export const categoryIcons = {
  PHOTO: Archive,
  RADIOGRAPH: ClipboardList,
  CLINICAL_HISTORY: ClipboardList,
  PAYMENT_RECEIPT: BadgeDollarSign,
  OTHER: Archive
};

export const paymentMethods = ["Efectivo", "Tarjeta", "Transferencia", "Cheque", "Otro"];
