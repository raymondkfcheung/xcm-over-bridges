#!/usr/bin/env bash

set -e

npx @acala-network/chopsticks xcm \
    -r kusama \
    -p kusama-asset-hub \
    -p kusama-bridge-hub
