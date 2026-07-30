import { LAYOUT_LIMITS } from "@3pb/cyd-layout-schema";

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

export class InvalidDeviceModel extends Error {
  status = 400;
  constructor(public value: string) {
    super(
      `model tidak valid (kosongkan atau maks ${LAYOUT_LIMITS.maxPrinterModelLength} byte): ${value}`,
    );
    this.name = "InvalidDeviceModel";
  }
}
