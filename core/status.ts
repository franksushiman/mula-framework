import fs from "fs";
import path from "path";

const statePath = path.resolve("core/state/state.json");

export function getCoreStatus() {
  if (!fs.existsSync(statePath)) {
    return "Estado canônico ausente.";
  }

  const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));

  if (!state.booted) {
    return "Core não inicializado.";
  }

  return "Core ativo e soberano.";
}
