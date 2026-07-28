export class SlotLimitExceeded extends Error {
  status = 409;
  constructor(public limit: number) {
    super(`Batas ${limit} printer sudah tercapai`);
    this.name = "SlotLimitExceeded";
  }
}

export class InvalidPrinterType extends Error {
  status = 400;
  constructor(public value: string) {
    super(`printerType tidak valid: ${value}`);
    this.name = "InvalidPrinterType";
  }
}

export class DeviceNotFound extends Error {
  status = 404;
  constructor() {
    super("Device tidak ditemukan");
    this.name = "DeviceNotFound";
  }
}
