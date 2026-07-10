"use client";

import { useEffect, useState } from "react";

/**
 * Nº de columnas del grid según breakpoints (1 / 2 / 3 / 4), compartido por
 * PersonsTab y HospitalsTab para calcular el pageSize.
 */
export function useHospitalGridColumns(maxColumns: 3 | 4 = 3): number {
  const [cols, setCols] = useState<number>(maxColumns);

  useEffect(() => {
    const mqSm = window.matchMedia("(min-width: 640px)");
    const mqLg = window.matchMedia("(min-width: 960px)");
    const mqXl = window.matchMedia("(min-width: 1280px)");
    const update = () => {
      if (maxColumns === 4 && mqXl.matches) setCols(4);
      else if (mqLg.matches) setCols(3);
      else if (mqSm.matches) setCols(2);
      else setCols(1);
    };
    update();
    mqSm.addEventListener("change", update);
    mqLg.addEventListener("change", update);
    mqXl.addEventListener("change", update);
    return () => {
      mqSm.removeEventListener("change", update);
      mqLg.removeEventListener("change", update);
      mqXl.removeEventListener("change", update);
    };
  }, [maxColumns]);

  return cols;
}
