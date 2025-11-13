#!/usr/bin/env bash

set -e

RUNTIMES_VERSION="v2.0.2"
THIS_DIR=$(cd $(dirname $0); pwd)
PROJECT_DIR=${THIS_DIR}/../
cd ${PROJECT_DIR}

# Parachain name, or default to "Kusama Bridge Hub"
PARACHAIN_NAME="${1:-Kusama Bridge Hub}"

# For WASM filename
PARACHAIN_UNDERSCORE=$(echo "${PARACHAIN_NAME}" | tr '[:upper:]' '[:lower:]' | tr ' ' '_')
if [[ "${PARACHAIN_UNDERSCORE}" =~ ^(kusama|polkadot)_ ]] && [[ "${PARACHAIN_UNDERSCORE}" =~ _ ]]; then
    REST_OF_NAME=$(echo "${PARACHAIN_UNDERSCORE}" | cut -d'_' -f2-)
    FIRST_WORD=$(echo "${PARACHAIN_UNDERSCORE}" | cut -d'_' -f1)
    PARACHAIN_UNDERSCORE="${REST_OF_NAME}_${FIRST_WORD}"
fi

# For config filename
PARACHAIN_HYPHEN=$(echo "${PARACHAIN_NAME}" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')

# WASM file path to check and download
WASM_FILE_PATH="wasms/${PARACHAIN_UNDERSCORE}_runtime.compact.compressed.wasm"

# Config file path to check and download
CONFIG_FILE_PATH="configs/${PARACHAIN_HYPHEN}-override.yaml"

if [ ! -f "${WASM_FILE_PATH}" ]; then
    echo "${PARACHAIN_NAME} WASM (${WASM_FILE_PATH}) not found. Downloading..."
    mkdir -p wasms
    wget https://github.com/polkadot-fellows/runtimes/releases/download/${RUNTIMES_VERSION}/runtimes-with-try-runtime-and-logging.zip -O wasms/runtimes_${RUNTIMES_VERSION}-wasms.zip
    unzip -o wasms/runtimes_${RUNTIMES_VERSION}-wasms.zip -d wasms/
fi

if [ ! -f "${CONFIG_FILE_PATH}" ]; then
    echo "${PARACHAIN_NAME} Config (${CONFIG_FILE_PATH}) not found. Downloading..."
    mkdir -p configs
    wget https://raw.githubusercontent.com/AcalaNetwork/chopsticks/master/configs/${PARACHAIN_HYPHEN}.yml -O "${CONFIG_FILE_PATH}"
    echo "runtime-log-level: 5" >> "${CONFIG_FILE_PATH}"
    echo "wasm-override: wasms/${PARACHAIN_UNDERSCORE}_runtime.compact.compressed.wasm" >> "${CONFIG_FILE_PATH}"
fi
