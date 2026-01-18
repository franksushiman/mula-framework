# MULA Core — V3

Este diretório contém o núcleo soberano do MULA.

O Core é **headless**:
- não depende de mensageiros
- não depende de UI
- não depende de país
- não depende de infraestrutura específica

---

## Responsabilidades do Core

O Core é responsável exclusivamente por:
- estado canônico
- contratos
- regras de soberania
- decisões operacionais
- federação entre nós

---

## O que NÃO pertence ao Core

O Core nunca deve:
- lidar com APIs de mensageiros
- interpretar comandos de interface
- formatar respostas para canais específicos
- acessar dados de pagamento
- conhecer UX ou UI

Essas responsabilidades pertencem às interfaces.

---

## Interfaces

Toda comunicação externa ocorre via interfaces,
que devem obedecer estritamente ao
Contrato de Interface do MULA.

Ver:
docs/contracts/public/interface-contract.md
