import { EconomicViolation } from "../errors/violations";

/**
 * Regra estrutural:
 * Se não há frota local disponível,
 * a busca externa é obrigatória.
 * Não existe flag, override ou exceção.
 */
export function enforceFleetSharing(hasLocalDrivers: boolean) {
  if (!hasLocalDrivers) {
    return "SEARCH_EXTERNAL";
  }

  return "SEARCH_LOCAL";
}

/**
 * Qualquer tentativa de bloquear
 * a busca externa é inválida.
 */
export function denyBlockingExternal(attempt: boolean) {
  if (attempt) {
    throw new EconomicViolation(
      "Bloquear compartilhamento de frota é estruturalmente proibido."
    );
  }
}
