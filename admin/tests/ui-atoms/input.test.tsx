import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Input } from "@/src/ui/atoms/input";

describe("Input", () => {
  it("renders a text input by default", () => {
    render(<Input value="" onChange={vi.fn()} />);
    const input = screen.getByRole("textbox");
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("type", "text");
  });

  it("renders with an associated label when label prop is provided", () => {
    render(<Input label="Email" value="" onChange={vi.fn()} />);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("reflects the value prop", () => {
    render(<Input value="hello" onChange={vi.fn()} />);
    expect(screen.getByRole("textbox")).toHaveValue("hello");
  });

  it("fires onChange when the user types", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<Input value="" onChange={handleChange} />);
    await user.type(screen.getByRole("textbox"), "a");
    expect(handleChange).toHaveBeenCalled();
  });

  it("respects a custom type prop", () => {
    render(<Input type="email" value="" onChange={vi.fn()} />);
    // email inputs are still accessible as textbox role in some implementations;
    // assert on the attribute directly.
    const input = document.querySelector("input");
    expect(input).toHaveAttribute("type", "email");
  });

  it("generates unique ids for two inputs that share the same label", () => {
    const { unmount } = render(
      <div>
        <Input label="Contraseña" value="" onChange={vi.fn()} />
        <Input label="Contraseña" value="" onChange={vi.fn()} />
      </div>,
    );
    const inputs = Array.from(document.querySelectorAll("input"));
    expect(inputs).toHaveLength(2);
    const id1 = inputs[0]?.getAttribute("id");
    const id2 = inputs[1]?.getAttribute("id");
    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();
    expect(id1).not.toBe(id2);
    unmount();
  });
});
