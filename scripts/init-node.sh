#!/bin/bash

echo "🔧 Inicializando instância MULA V3..."

if [ ! -f core/config/node.json ]; then
  echo "❌ Configuração do nó não encontrada."
  exit 1
fi

node core/index.ts
