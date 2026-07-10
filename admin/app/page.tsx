import type { Metadata } from "next";
import { Shell } from "./shell";
import { Home } from "./home";

export const metadata: Metadata = {
  robots: { index: false },
};

export default function Page() {
  return (
    <Shell>
      <Home />
    </Shell>
  );
}
