// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AgentShell } from "./AgentShell";

beforeEach(() => {
  (globalThis as any).window.agentApi = {
    getCredentialStoreStatus: vi.fn().mockResolvedValue({ degraded: false }),
  };
});

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

describe("AgentShell credential-store degraded banner", () => {
  it("getCredentialStoreStatus degraded:false -> banner TIDAK tampil", async () => {
    render(
      <AgentShell>
        <p>x</p>
      </AgentShell>,
    );
    await waitFor(() => expect(screen.getByAltText(/slizebiz/i)).toBeTruthy());
    expect(screen.queryByText(/penyimpanan kredensial/i)).toBeNull();
  });

  it("getCredentialStoreStatus degraded:true -> banner peringatan tampil, terlihat di layar manapun (Activation/Pairing/Dashboard sama-sama pakai AgentShell)", async () => {
    (window as any).agentApi.getCredentialStoreStatus.mockResolvedValue({ degraded: true });
    render(
      <AgentShell>
        <p>x</p>
      </AgentShell>,
    );
    await waitFor(() => expect(screen.getByText(/penyimpanan kredensial/i)).toBeTruthy());
  });

  it("getCredentialStoreStatus reject (IPC error) -> tidak crash, banner default tak tampil", async () => {
    (window as any).agentApi.getCredentialStoreStatus.mockRejectedValue(new Error("ipc boom"));
    render(
      <AgentShell>
        <p>x</p>
      </AgentShell>,
    );
    await waitFor(() => expect(screen.getByAltText(/slizebiz/i)).toBeTruthy());
    expect(screen.queryByText(/penyimpanan kredensial/i)).toBeNull();
  });
});
