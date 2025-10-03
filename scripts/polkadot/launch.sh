#!/usr/bin/env bash

set -e

npx @acala-network/chopsticks xcm \
    -r polkadot \
    -p polkadot-asset-hub \
    -p polkadot-bridge-hub
