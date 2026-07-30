// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AgentShell } from "./AgentShell";

describe("AgentShell", () => {
  it("render children di dalam shell", () => {
    render(
      <AgentShell>
        <p>Isi layar</p>
      </AgentShell>,
    );
    expect(screen.getByText("Isi layar")).toBeTruthy();
  });

  it("tampilkan logo Slizebiz", () => {
    render(
      <AgentShell>
        <p>x</p>
      </AgentShell>,
    );
    expect(screen.getByAltText(/slizebiz/i)).toBeTruthy();
  });
});
