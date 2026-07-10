/**
 * Design-system tokens for @/src/ui atoms.
 *
 * Minimal semantic class constants — only what the existing atoms consume.
 * No speculative tokens (YAGNI).
 */

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

/** Classes shared by every Button variant. */
export const buttonBase =
  "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 " +
  "disabled:pointer-events-none disabled:opacity-50";

/** Per-variant colour classes for Button. */
export const buttonVariants = {
  primary:
    "bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-500",
  ghost:
    "bg-transparent text-blue-600 hover:bg-blue-50 focus-visible:ring-blue-500",
} as const;

// ---------------------------------------------------------------------------
// MetricCard
// ---------------------------------------------------------------------------

export const metricCardShell =
  "rounded-lg border border-gray-200 bg-white p-4 shadow-sm";
export const metricCardLabel = "text-sm text-gray-500";
export const metricCardValue = "mt-1 text-3xl font-bold text-gray-900";
export const metricCardSub = "mt-1 text-xs text-gray-400";

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export const inputBase =
  "block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 " +
  "placeholder:text-gray-400 " +
  "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:border-blue-500 " +
  "disabled:pointer-events-none disabled:opacity-50";
export const inputLabel = "mb-1 block text-sm font-medium text-gray-700";
