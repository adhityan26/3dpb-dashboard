export class AlreadyOwned extends Error {
  constructor() {
    super("already_owned");
    this.name = "AlreadyOwned";
  }
}

export class PriceNotSet extends Error {
  constructor() {
    super("price_not_set");
    this.name = "PriceNotSet";
  }
}

export class QrisNotSet extends Error {
  constructor() {
    super("qris_not_set");
    this.name = "QrisNotSet";
  }
}

export class CodePoolExhausted extends Error {
  constructor() {
    super("code_pool_exhausted");
    this.name = "CodePoolExhausted";
  }
}

export class InvalidQuantity extends Error {
  constructor() {
    super("invalid_quantity");
    this.name = "InvalidQuantity";
  }
}

export class InvalidShippingAddress extends Error {
  constructor() {
    super("invalid_shipping_address");
    this.name = "InvalidShippingAddress";
  }
}

export class InvalidCydVariant extends Error {
  constructor() {
    super("invalid_cyd_variant");
    this.name = "InvalidCydVariant";
  }
}
