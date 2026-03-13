import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ToastProvider, useToast } from "@/components/Toast";

function ToastTrigger({ text, type }: { text: string; type?: "error" | "success" | "info" }) {
  const { showToast } = useToast();
  return (
    <button onClick={() => showToast(text, type)}>
      Trigger
    </button>
  );
}

describe("Toast", () => {
  it("shows toast message when triggered", () => {
    render(
      <ToastProvider>
        <ToastTrigger text="Test message" />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText("Trigger"));
    expect(screen.getByText("Test message")).toBeInTheDocument();
  });

  it("shows error toast by default", () => {
    render(
      <ToastProvider>
        <ToastTrigger text="Error!" />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText("Trigger"));
    const toast = screen.getByText("Error!").closest("div");
    expect(toast?.className).toContain("red");
  });

  it("shows success toast with green styling", () => {
    render(
      <ToastProvider>
        <ToastTrigger text="Success!" type="success" />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText("Trigger"));
    const toast = screen.getByText("Success!").closest("div");
    expect(toast?.className).toContain("green");
  });

  it("dismisses toast when X clicked", () => {
    render(
      <ToastProvider>
        <ToastTrigger text="Dismiss me" />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText("Trigger"));
    expect(screen.getByText("Dismiss me")).toBeInTheDocument();

    // Find and click the dismiss button
    const dismissButton = screen.getByText("Dismiss me").parentElement?.querySelector("button");
    if (dismissButton) fireEvent.click(dismissButton);
    expect(screen.queryByText("Dismiss me")).not.toBeInTheDocument();
  });

  it("auto-dismisses after timeout", async () => {
    vi.useFakeTimers();

    render(
      <ToastProvider>
        <ToastTrigger text="Auto dismiss" />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText("Trigger"));
    expect(screen.getByText("Auto dismiss")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.queryByText("Auto dismiss")).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("can show multiple toasts", () => {
    function MultiTrigger() {
      const { showToast } = useToast();
      return (
        <>
          <button onClick={() => showToast("First")}>First</button>
          <button onClick={() => showToast("Second", "success")}>Second</button>
        </>
      );
    }

    render(
      <ToastProvider>
        <MultiTrigger />
      </ToastProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "First" }));
    fireEvent.click(screen.getByRole("button", { name: "Second" }));

    expect(screen.getAllByText("First")).toHaveLength(2); // button + toast
    expect(screen.getAllByText("Second")).toHaveLength(2);
  });
});
