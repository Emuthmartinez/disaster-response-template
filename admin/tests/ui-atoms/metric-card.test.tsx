import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MetricCard } from "@/src/ui/atoms/metric-card";

describe("MetricCard", () => {
  it("renders label", () => {
    render(<MetricCard label="Total reportes" value={42} />);
    expect(screen.getByText("Total reportes")).toBeInTheDocument();
  });

  it("renders numeric value", () => {
    render(<MetricCard label="Total reportes" value={42} />);
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("renders string value", () => {
    render(<MetricCard label="Total reportes" value="N/A" />);
    expect(screen.getByText("N/A")).toBeInTheDocument();
  });

  it("renders sub when provided", () => {
    render(<MetricCard label="Total reportes" value={42} sub="últimas 24h" />);
    expect(screen.getByText("últimas 24h")).toBeInTheDocument();
  });

  it("does not render sub element when sub is absent", () => {
    render(<MetricCard label="Total reportes" value={42} />);
    expect(screen.queryByText("últimas 24h")).not.toBeInTheDocument();
  });

  it("applies accent colour to the value element", () => {
    render(<MetricCard label="Total reportes" value={42} accent="#ef4444" />);
    const valueEl = screen.getByText("42");
    expect(valueEl).toHaveStyle({ color: "#ef4444" });
  });

  it("does not apply inline color style when accent is absent", () => {
    render(<MetricCard label="Total reportes" value={42} />);
    const valueEl = screen.getByText("42");
    expect(valueEl).not.toHaveAttribute("style");
  });
});
