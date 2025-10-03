#!/usr/bin/env bash

set -e

echo "Launching Kusama..."
npx @acala-network/chopsticks xcm \
    -r kusama \
    -p kusama-asset-hub \
    -p kusama-bridge-hub
