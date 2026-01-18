# Contrato de Interface — MULA V3

Este documento define o contrato mínimo entre o Core do MULA
e qualquer interface de comunicação (mensageiro, app, terminal).

Interfaces são descartáveis.
O Core é soberano.

---

## 1. Definição

Uma interface é qualquer camada responsável por:
- receber mensagens de humanos
- enviar respostas do Core
- identificar a origem da mensagem

A interface NÃO contém lógica de negócio.

---

## 2. Requisitos mínimos da interface

Toda interface DEVE:

1. Receber texto bruto
2. Enviar texto bruto
3. Identificar o emissor (ID único)
4. Preservar ordem das mensagens
5. Encaminhar mensagens ao Core sem interpretação semântica

---

## 3. Proibições absolutas

Uma interface NUNCA pode:

- calcular preço
- decidir motorista
- filtrar solicitações
- modificar intenção do usuário
- armazenar estado canônico
- intermediar pagamento
- impor regras locais

Toda tentativa de violação DEVE interromper a execução.

---

## 4. Responsabilidades do Core

O Core é o único responsável por:

- estados
- regras
- contratos
- soberania
- decisões operacionais

A interface apenas transmite.

---

## 5. Neutralidade tecnológica

O MULA não depende de:
- WhatsApp
- Telegram
- WeChat
- Web
- Mobile
- Cloud

Qualquer tecnologia capaz de trocar texto
pode ser uma interface válida.

---

## 6. Consequência de violação

Interfaces que violem este contrato
DEVEM ser consideradas inválidas
e não podem operar o Core do MULA.
