import { EconomicViolation } from "../errors/violations";

/**
 * Um nó que apenas encaminha
 * não pode capturar valor econômico.
 */
export function denyBridgeCapture(
  isBridgeNode: boolean,
  attemptToCharge: boolean
) {
  if (isBridgeNode && attemptToCharge) {
    throw new EconomicViolation(
      "Nó-ponte não pode capturar valor econômico."
    );
  }
}
