"use client";

import type { KeyboardEvent } from "react";

export interface TabDef<T extends string> {
  id: T;
  label: string;
  tabId: string;
  panelId: string;
}

interface TabNavProps<T extends string> {
  tabs: ReadonlyArray<TabDef<T>>;
  active: T;
  onSelect: (tab: T) => void;
  ariaLabel: string;
  /** compact: pestañas compactas alineadas a la izquierda (sin flex-1). */
  variant?: "default" | "compact";
}

export function TabNav<T extends string>({
  tabs,
  active,
  onSelect,
  ariaLabel,
  variant = "default",
}: TabNavProps<T>) {
  const listClass = variant === "compact" ? "e-m-tab-nav__list" : "e-tab-list";
  const tabClass =
    variant === "compact"
      ? "e-m-tab-nav__tab"
      : "e-tab-label flex flex-1 items-center justify-center";

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex = index;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") {
      nextIndex = (index - 1 + tabs.length) % tabs.length;
    }
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = tabs.length - 1;
    else return;

    event.preventDefault();
    onSelect(tabs[nextIndex].id);
    event.currentTarget.parentElement
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
      [nextIndex]?.focus();
  }

  return (
    <div role="tablist" aria-label={ariaLabel} className={listClass}>
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={tab.tabId}
          aria-selected={active === tab.id}
          aria-controls={tab.panelId}
          data-active={active === tab.id}
          tabIndex={active === tab.id ? 0 : -1}
          onClick={() => onSelect(tab.id)}
          onKeyDown={(event) => handleKeyDown(event, index)}
          className={tabClass}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
