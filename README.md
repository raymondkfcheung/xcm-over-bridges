# XCM over Bridges

Local E2E Test (PAH ⇄ PBH, PBH ⇄ KBH, KBH ⇄ KAH)

This README [walks you through](walkthrough.md) spinning up **local Kusama & Polkadot networks** (with Asset Hubs & Bridge Hubs via Chopsticks), wiring **polkadot-api (papi)** endpoints, and running the [**`transfers across Bridges`**](tests/bridges/xcm-over-bridges.test.ts) Vitest spec that [dry-runs and executes the XCM](testing.md), then verifies pre/post balances and on-chain events.

## Clone

```bash
git clone https://github.com/raymondkfcheung/xcm-over-bridges.git
cd xcm-over-bridges
```

## Global dependency

Install Chopsticks (latest):

```bash
npm install -g @acala-network/chopsticks@latest
```

## (Optional) Init a fresh TS/Vitest project

> Skip if you're using this repo as-is. For a fresh scratch project:

```bash
npm init -y
npx tsc --init
npm i -D vitest typescript
```

## Launch local chains (3 terminals)

### Terminal A - Kusama stack

```bash
./scripts/kusama/launch.sh
```

This starts:

* Kusama Asset Hub (ws://localhost:8000)
* Kusama Bridge Hub (ws://localhost:8001)
* Kusama relay (ws://localhost:8002)

### Terminal B - Polkadot stack

```bash
./scripts/polkadot/launch.sh
```

This starts:

* Polkadot Asset Hub (ws://localhost:8003)
* Polkadot Bridge Hub (ws://localhost:8004)
* Polkadot relay (ws://localhost:8005)

> Keep both terminals running.

### Terminal C - Register endpoints with papi

After Kusama finishes booting:

```bash
npx papi add KusamaAssetHub   -w ws://localhost:8000
npx papi add KusamaBridgeHub  -w ws://localhost:8001
npx papi add Kusama           -w ws://localhost:8002
```

After Polkadot finishes booting:

```bash
npx papi add PolkadotAssetHub  -w ws://localhost:8003
npx papi add PolkadotBridgeHub -w ws://localhost:8004
npx papi add Polkadot          -w ws://localhost:8005
```

## Run the test

```bash
npx vitest run -t "transfers across Bridges"
```

What the test does (high level):

* **Builds/normalizes the XCM**: strips the origin-shaping steps when simulating, runs dry-run with a **correct origin** so the simulator matches the on-chain context.
* **Queries weight** on the destination via `XcmPaymentApi.query_xcm_weight`.
* **Executes** the XCM on **Kusama Asset Hub**.
* **Asserts events**:
  * `Balances.Burned` (sender)
  * `Balances.Minted` (beneficiary)
  * `TransactionPayment.TransactionFeePaid` (fee)
* **Checks pre/post balances** (native KSM on KAH via `System.Account.data.free`) to ensure:
  * Sender decreased by `amount + fee`
  * Beneficiary increased by `amount`

## Run just this test again

```bash
npx vitest run -t "transfers across Bridges"
```
