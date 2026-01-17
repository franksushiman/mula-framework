import fs from "fs";
import { SovereigntyViolation } from "../errors/violations";

/**
 * O core não pode iniciar
 * sem o contrato econômico público.
 */
export function assertEconomicContract() {
  const path = "docs/contracts/public/economic-contract.md";

  if (!fs.existsSync(path)) {
    throw new SovereigntyViolation(
      "Contrato econômico ausente. Core bloqueado."
    );
  }
}
