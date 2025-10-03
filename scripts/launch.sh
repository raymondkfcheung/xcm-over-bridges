#!/usr/bin/env bash

set -e

THIS_DIR=$(cd $(dirname $0); pwd)
${THIS_DIR}/scripts/kusama/launch.sh &
${THIS_DIR}/scripts/polkadot/launch.sh &

# npx papi add KusamaAssetHub -w ws://localhost:8000
# npx papi add KusamaBridgeHub -w ws://localhost:8001
# npx papi add PolkadotAssetHub -w ws://localhost:8003
# npx papi add PolkadotBridgeHub -w ws://localhost:8004
