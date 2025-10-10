#!/usr/bin/env bash

set -e

THIS_DIR=$(cd $(dirname $0); pwd)
PROJECT_DIR=${THIS_DIR}/../
cd ${PROJECT_DIR}

if [ ! -f "wasms/bridge_hub_kusama_runtime.compact.compressed.wasm" ]; then
    echo "Kusama Bridge Hub WASM not found. Downloading..."
    mkdir -p wasms
    wget https://github.com/polkadot-fellows/runtimes/releases/download/v1.9.1/compact-wasms.zip -O wasms/runtimes_v1.9.1-wasms.zip
    unzip wasms/runtimes_v1.9.1-wasms.zip -d wasms/
fi

if [ ! -f "configs/kusama-bridge-hub-override.yaml" ]; then
     echo "Kusama Bridge Hub Config not found. Downloading..."
     mkdir -p configs
     wget https://raw.githubusercontent.com/AcalaNetwork/chopsticks/master/configs/kusama-bridge-hub.yml -O configs/kusama-bridge-hub-override.yaml
     echo "runtime-log-level: 5" >> configs/kusama-bridge-hub-override.yaml
     echo "wasm-override: wasms/bridge_hub_kusama_runtime.compact.compressed.wasm" >> configs/kusama-bridge-hub-override.yaml
fi
