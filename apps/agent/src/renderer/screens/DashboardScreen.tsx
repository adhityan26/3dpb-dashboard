import { useEffect, useState } from "react";
import type { PrintersPayload } from "@3pb/printer-monitor-core";

export function DashboardScreen() {
  const [snapshot, setSnapshot] = useState<PrintersPayload>({ payload: [] });
  const [brokerInfo, setBrokerInfo] = useState<{ ip: string; port: number | null } | null>(null);

  useEffect(() => {
    const load = () => {
      window.agentApi.getSnapshot().then(setSnapshot);
    };
    load();
    const timer = setInterval(load, 5000);
    window.agentApi.getBrokerInfo().then(setBrokerInfo);
    return () => clearInterval(timer);
  }, []);

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <div>
        <button onClick={() => window.agentApi.sync()}>Sync</button>
      </div>
      {brokerInfo && (
        <p>
          Alamat broker (ketik ini di setup WiFi CYD):{" "}
          {brokerInfo.port !== null ? `${brokerInfo.ip}:${brokerInfo.port}` : "broker belum jalan (port 1883 dipakai proses lain)"}
        </p>
      )}
      <ul>
        {snapshot.payload.map((p) => (
          <li key={p.id}>
            <span>{p.name}</span> — {p.state} — {p.progress}%
          </li>
        ))}
      </ul>
    </div>
  );
}
