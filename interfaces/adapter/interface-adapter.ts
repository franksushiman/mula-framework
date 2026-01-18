/**
 * Interface Adapter — MULA V3
 *
 * Este módulo define o contrato mínimo
 * entre interfaces e o Core.
 */

export type IncomingMessage = {
  senderId: string;
  text: string;
};

export type OutgoingMessage = {
  text: string;
};

export interface InterfaceAdapter {
  receive(message: IncomingMessage): Promise<OutgoingMessage | null>;
}
