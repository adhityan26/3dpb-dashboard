import { useEffect, useState } from "react";
import type { PlateInfo } from "../../main/file-manager/threemf-parser";

interface PrintStartDialogProps {
  shortCode: string;
  deviceLabel: string;
  remotePath: string;
  onClose: () => void;
}

type Step = "loading" | "pick-plate" | "confirm" | "sending" | "error" | "sent-unconfirmed";

// File .gcode polos (bukan .gcode.3mf) tidak punya metadata plate/AMS — parseThreemf akan
// throw "not_bambu_3mf". Ini BUKAN error sungguhan untuk kasus ini, cuma sinyal "skip plate picker".
function isPlainGcode(remotePath: string): boolean {
  return remotePath.endsWith(".gcode") && !remotePath.endsWith(".gcode.3mf");
}

export function PrintStartDialog({ shortCode, deviceLabel, remotePath, onClose }: PrintStartDialogProps) {
  const [step, setStep] = useState<Step>("loading");
  const [plates, setPlates] = useState<PlateInfo[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isPlainGcode(remotePath)) {
      // Plain gcode: tidak ada plate, langsung ke langkah konfirmasi (plateIndex 1 sebagai default).
      setSelectedIndex(1);
      setStep("confirm");
      return;
    }
    window.agentApi
      .parseThreemf(shortCode, remotePath)
      .then((result) => {
        setPlates(result);
        setSelectedIndex(result[0]?.index ?? null);
        setStep("pick-plate");
      })
      .catch((error) => {
        if (error instanceof Error && error.message === "not_bambu_3mf") {
          setErrorMessage("File bukan format Bambu yang valid");
        } else {
          setErrorMessage("Gagal membaca file — periksa koneksi ke printer");
        }
        setStep("error");
      });
  }, [shortCode, remotePath]);

  async function handleConfirm() {
    if (selectedIndex === null) return;
    setStep("sending");
    const result = await window.agentApi.sendPrinterCommand(shortCode, {
      kind: "startPrint",
      filename: remotePath,
      plateIndex: selectedIndex,
    });
    if (!result.ok) {
      setErrorMessage(result.message || "Gagal mengirim command print ke printer");
      setStep("error");
      return;
    }
    setStep("sent-unconfirmed");
  }

  if (step === "loading") return <div role="dialog">Membaca metadata file...</div>;
  if (step === "error") return <div role="dialog">{errorMessage ?? "File bukan format Bambu yang valid"}<button onClick={onClose}>Tutup</button></div>;
  if (step === "sent-unconfirmed")
    return (
      <div role="dialog">
        Command terkirim ke printer. Cek langsung ke printer untuk konfirmasi status print.
        <button onClick={onClose}>Tutup</button>
      </div>
    );

  const selectedPlate = plates.find((p) => p.index === selectedIndex);

  return (
    <div role="dialog">
      {step === "pick-plate" && (
        <>
          <h3>Print: {remotePath.split("/").pop()}</h3>
          <p>Pilih plate</p>
          {plates.map((plate) => (
            <button key={plate.index} onClick={() => setSelectedIndex(plate.index)} aria-pressed={plate.index === selectedIndex}>
              Plate {plate.index}
            </button>
          ))}
          <p>AMS mapping (default file)</p>
          <ul>
            {selectedPlate?.filaments.map((f) => (
              <li key={f.id}>
                Filament {f.id} ({f.type} {f.color}) → AMS slot {f.amsSlot}
              </li>
            ))}
          </ul>
          <button onClick={onClose}>Batal</button>
          <button onClick={() => setStep("confirm")}>Lanjut</button>
        </>
      )}

      {step === "confirm" && (
        <>
          <h3>Konfirmasi Print</h3>
          <p>
            Printer <b>{deviceLabel}</b> akan mulai print {plates.length > 0 ? `plate ${selectedIndex}` : remotePath.split("/").pop()}. Yakin? Aksi ini tidak bisa dibatalkan setelah dimulai.
          </p>
          <button onClick={() => setStep("pick-plate")}>Batal</button>
          <button onClick={handleConfirm}>Ya, Mulai Print</button>
        </>
      )}

      {step === "sending" && <p>Mengirim command...</p>}
    </div>
  );
}
