export class SovereigntyViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SovereigntyViolation";
  }
}

export class EconomicViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EconomicViolation";
  }
}
