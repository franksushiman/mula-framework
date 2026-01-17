import { EconomicViolation } from "../errors/violations";

/**
 * Monetização só é permitida
 * quando a frota é local.
 */
export function enforceLocalMonetization(
  isLocalDriver: boolean,
  attemptToMonetize: boolean
) {
  if (attemptToMonetize && !isLocalDriver) {
    throw new EconomicViolation(
      "Monetização de frota externa é proibida."
    );
  }
}
