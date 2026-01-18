# MULA — Framework de Coordenação Descentralizada

MULA é um **framework headless** para coordenação de transporte, entregas e serviços via mensagens, sem intermediação comercial e sem entidade central controladora.

Este repositório contém **apenas o framework**.  
Ele **não entrega soluções prontas**, **não é um produto final** e **não define casos de uso específicos**.

---

## O que o MULA é

- Um **framework**, não um serviço
- **Descentralizado por arquitetura**
- **Neutro** quanto a país, cultura, idioma ou economia
- **Mensageiro-agnóstico** (WhatsApp, Telegram, WeChat, outros)
- **Auditável e extensível**
- Capaz de **conectar nós independentes** em uma rede federada

O MULA **coordena pessoas**.  
Ele não vende corridas, não intermedia pagamentos e não captura valor.

---

## O que o MULA não é

- Não é marketplace
- Não é aplicativo de delivery
- Não é Uber, iFood, 99 ou similares
- Não é uma solução pronta para restaurantes, comunidades ou empresas
- Não impõe modelo econômico
- Não exige confiança cega

---

## Arquitetura

- **Core (`/core`)**  
  Núcleo soberano, headless, responsável por regras, contratos e estado canônico.

- **Interfaces (`/interfaces`)**  
  Plugins de comunicação. Exemplo: WhatsApp.  
  Interfaces apenas transmitem mensagens e obedecem ao Contrato de Interface.

- **Contratos (`/docs/contracts`)**  
  Documentos públicos e auditáveis que definem soberania, limites e regras.

- **Distribuições (`/distributions`)**  
  Conceito documentado.  
  Distribuições concretas **não fazem parte deste repositório**.

---

## Princípios fundamentais

- Não coerção
- Soberania local
- Compartilhamento de frota como regra estrutural
- Ausência de intermediação obrigatória
- Separação total entre framework e produto

---

## Sobre uso comercial

O MULA **pode ser usado para criar soluções comerciais**,  
mas **este repositório não contém**:

- presets de mercado
- integrações de pagamento
- fluxos de negócio específicos
- configurações por país ou setor

Esses elementos pertencem a **distribuições externas**, fora do GitHub.

---

## Status do projeto

Este repositório representa o **MULA V3 — Core**.  
O framework aqui contido é considerado **completo, funcional e extensível**.

Evoluções futuras devem ocorrer via:
- novas interfaces
- novos contratos
- ou distribuições externas

---

## Licença e posição

O MULA não pertence a um país, empresa ou plataforma.  
Ele existe para **permitir coordenação descentralizada sem captura**.

