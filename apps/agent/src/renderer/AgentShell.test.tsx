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

  // Selama staging, versi package.json tak pernah naik tiap rebuild -- footer commit hash
  // ini satu-satunya cara user bedain build yang lagi jalan di layar dari build sebelumnya.
  it("tampilkan build id (versi+commit hash) di footer -- fallback 0.0.0+nogit di luar build sungguhan", () => {
    render(
      <AgentShell>
        <p>x</p>
      </AgentShell>,
    );
    expect(screen.getByText(/0\.0\.0\+nogit/)).toBeTruthy();
  });
});
