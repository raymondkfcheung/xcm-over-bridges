#!/usr/bin/env bash

set -e

THIS_DIR=$(cd $(dirname $0); pwd)
PROJECT_DIR=${THIS_DIR}/../../
cd ${PROJECT_DIR}

if [ ! -f "wasms/bridge_hub_polkadot_runtime.compact.compressed.wasm" ]; then
    echo "Polkadot Bridge Hub WASM not found. Downloading..."
    mkdir -p wasms
    wget https://github.com/polkadot-fellows/runtimes/releases/download/v1.9.1/compact-wasms.zip -O wasms/runtimes_v1.9.1-wasms.zip
    unzip wasms/runtimes_v1.9.1-wasms.zip -d wasms/
fi

if [ ! -f "configs/polkadot-bridge-hub-override.yaml" ]; then
     echo "Polkadot Bridge Hub Config not found. Downloading..."
     mkdir -p configs
     wget https://raw.githubusercontent.com/AcalaNetwork/chopsticks/master/configs/polkadot-bridge-hub.yml -O configs/polkadot-bridge-hub-override.yaml
fi

echo "Launching Polkadot..."
npx @acala-network/chopsticks xcm \
    -r polkadot \
    -p polkadot-asset-hub \
    -p configs/polkadot-bridge-hub-override.yaml
