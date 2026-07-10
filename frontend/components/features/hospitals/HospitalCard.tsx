"use client";

/**
 * Item de lista del directorio: envuelve la tarjeta presentacional existente
 * (HospitalDirectoryUI) y dispara la analítica al abrir. Memoizado: la lista de
 * hospitales es grande y se re-renderiza al filtrar; con React.memo + identidad
 * estable de TanStack (structuralSharing) solo re-renderiza la tarjeta que cambia.
 */
import { memo, useCallback } from "react";
import { HospitalCard as DirectoryHospitalCard } from "@/components/features/hospitals/HospitalDirectoryUI";
import { trackHospitalDetailViewed } from "@/lib/analytics";
import type { Hospital } from "@/lib/hospitals-meta";

export interface HospitalCardProps {
  hospital: Hospital;
  onOpen: (hospital: Hospital) => void;
}

function HospitalCardImpl({ hospital, onOpen }: HospitalCardProps) {
  const handleOpen = useCallback(() => {
    trackHospitalDetailViewed({
      priorityZone: hospital.priorityZone,
      patientCount: hospital.activePatients,
      source: "hospital_card_overlay",
    });
    onOpen(hospital);
  }, [hospital, onOpen]);

  return <DirectoryHospitalCard hospital={hospital} onOpen={handleOpen} />;
}

const HospitalCard = memo(HospitalCardImpl);
export default HospitalCard;
