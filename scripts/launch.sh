#!/usr/bin/env bash

set -e

npx @acala-network/chopsticks xcm \
    -r polkadot \
    -p kusama-bridge-hub \
    -p polkadot-bridge-hub

# npx papi add KusamaBridgeHub -w ws://localhost:8000
# npx papi add PolkadotBridgeHub -w ws://localhost:8001
# npx papi add Polkadot -w ws://localhost:8002
