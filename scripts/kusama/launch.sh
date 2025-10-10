#!/usr/bin/env bash

set -e

THIS_DIR=$(cd $(dirname $0); pwd)
PROJECT_DIR=${THIS_DIR}/../../
cd ${PROJECT_DIR}

${PROJECT_DIR}/scripts/download-runtime.sh "Kusama Asset Hub"
${PROJECT_DIR}/scripts/download-runtime.sh "Kusama Bridge Hub"

echo "Launching Kusama..."
npx @acala-network/chopsticks xcm \
    -r kusama \
    -p configs/kusama-asset-hub-override.yaml \
    -p configs/kusama-bridge-hub-override.yaml
