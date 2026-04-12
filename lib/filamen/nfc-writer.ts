export async function writeNfcTag(spoolId: string): Promise<void> {
  if (!("NDEFReader" in window)) {
    throw new Error("Web NFC tidak tersedia. Gunakan Android Chrome.")
  }

  const ndef = new (window as unknown as { NDEFReader: new () => NDEFReader }).NDEFReader()
  await ndef.write({
    records: [{ recordType: "text", data: spoolId }],
  })
}
