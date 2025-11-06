#!/usr/bin/env bash

set -e

THIS_DIR=$(cd $(dirname $0); pwd)
PROJECT_DIR=${THIS_DIR}/../../
cd ${PROJECT_DIR}

# ${PROJECT_DIR}/scripts/download-runtime.sh "Polkadot Asset Hub"
${PROJECT_DIR}/scripts/download-runtime.sh "Polkadot Bridge Hub"

echo "Launching Polkadot..."
npx @acala-network/chopsticks@latest xcm \
    -r polkadot \
    -p configs/polkadot-asset-hub-override.yaml \
    -p configs/polkadot-bridge-hub-override.yaml
