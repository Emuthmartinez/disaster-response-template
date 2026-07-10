"use client";

import { useEffect, useState } from "react";

type NetworkInformation = EventTarget & {
  downlink?: number;
  effectiveType?: string;
  rtt?: number;
  saveData?: boolean;
};

type NavigatorWithConnection = Navigator & {
  connection?: NetworkInformation;
  mozConnection?: NetworkInformation;
  webkitConnection?: NetworkInformation;
};

function getConnection(): NetworkInformation | undefined {
  const nav = navigator as NavigatorWithConnection;
  return nav.connection ?? nav.mozConnection ?? nav.webkitConnection;
}

function readLowBandwidthState() {
  const connection = getConnection();
  const effectiveType = connection?.effectiveType ?? "";
  const isOnline = navigator.onLine;
  const isConstrained =
    !isOnline ||
    connection?.saveData === true ||
    effectiveType === "slow-2g" ||
    effectiveType === "2g" ||
    effectiveType === "3g" ||
    (typeof connection?.downlink === "number" && connection.downlink <= 2) ||
    (typeof connection?.rtt === "number" && connection.rtt >= 1_000);

  return { isOnline, isConstrained };
}

export function useLowBandwidthMode(
  normalPollMs: number,
  constrainedPollMs: number,
) {
  // El primer render debe ser idéntico en servidor y cliente: arrancamos con un
  // estado neutro y determinista. El estado real de la red (que solo existe en
  // el cliente) se aplica tras montar, en el efecto de abajo. Leerlo durante el
  // render inicial provocaría un error de hidratación.
  const [state, setState] = useState({ isOnline: true, isConstrained: false });

  useEffect(() => {
    const update = () => setState(readLowBandwidthState());
    const connection = getConnection();

    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    connection?.addEventListener?.("change", update);

    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      connection?.removeEventListener?.("change", update);
    };
  }, []);

  return {
    ...state,
    pollIntervalMs: state.isConstrained ? constrainedPollMs : normalPollMs,
  };
}
