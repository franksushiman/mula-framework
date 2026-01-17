import fs from "fs";
import path from "path";
import { assertEconomicContract } from "./guards/economic-contract.guard";

const statePath = path.resolve("core/state/state.json");

export function initCore() {
  assertEconomicContract();

  if (!fs.existsSync(statePath)) {
    throw new Error("Estado canônico ausente.");
  }

  const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
  state.booted = true;

  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  console.log("✅ MULA CORE iniciado com contrato econômico válido");
}

initCore();
