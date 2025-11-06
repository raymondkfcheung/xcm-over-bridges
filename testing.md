# 🧪 Why "XCM over Bridge" Is Hard to Test Off-Chain?

## 🧭 Context

**XCM** between **parachains in the same relay** (like Asset Hub → Bridge Hub inside Polkadot) is fully deterministic and reproducible off-chain. However, [**XCM over a relay bridge**](walkthrough.md) (e.g., **Polkadot ↔ Kusama**) involves an **inter-relay trustless protocol**, which depends on:

* **On-chain light clients** verifying finality proofs between relays
* **Off-chain relayers** submitting `receive_messages_proof` extrinsics
* **Runtime pallets** (`Bridge*Messages`, `Bridge*Grandpa`, `Bridge*Paras`) maintaining consensus states

This multi-layer interplay means even "dry-runs" can't directly simulate a real bridge roundtrip - since the **proof verification, relay headers, and message queues** aren't self-contained inside a single runtime.

The issues are tracked upstream:
* [paritytech/polkadot-sdk#4793](https://github.com/paritytech/polkadot-sdk/issues/4793)
* [paritytech/polkadot-sdk#7837](https://github.com/paritytech/polkadot-sdk/issues/7837)

## ⚙️ Existing Rust Tests

Parity provides a Rust macro such as [`test_dry_run_transfer_across_pk_bridge!()`](https://paritytech.github.io/polkadot-sdk/master/emulated_integration_tests_common/macro.test_dry_run_transfer_across_pk_bridge.html) that can **unit-test XCM payloads** in isolation inside the runtime. These tests [assert logic](https://github.com/paritytech/polkadot-sdk/blob/a4f007cd7c3643519de40ba33b6db08b38e1ac19/cumulus/parachains/integration-tests/emulated/tests/bridges/bridge-hub-rococo/src/tests/asset_transfers.rs#L569) like:

```rust
test_dry_run_transfer_across_pk_bridge! {
    AssetHubRococo,
    BridgeHubRococo,
    asset_hub_westend_location()
}
```

They don't perform real **bridge proof submissions** - only simulate the expected **XCM instruction sequence** that should appear in the outbound bridge message.

## 🧩 Off-Chain Test via Chopsticks

Using **Chopsticks**, we can emulate the [multi-chain topology locally](tests/bridges/xcm-over-bridges.test.ts) (4 parachains + 2 relays), then execute or dry-run each leg step-by-step.

### 1️⃣ Execute on Polkadot Asset Hub

```ts
const txOnPAH: Transaction<any, string, string, any> =
      polkadotAssetHubApi.tx.PolkadotXcm.transfer_assets({ ... });
const extrinsicOnPAH = await txOnPAH.signAndSubmit(aliceSigner);
expect(extrinsicOnPAH.ok).toBe(true);
```

This builds the real `transfer_assets` extrinsic, sending it to **Polkadot Bridge Hub**.

### 2️⃣ Decode Outbound Bridge Message on Polkadot Bridge Hub

```ts
const messageKey = messageAcceptedEvents.at(-1).payload;
const outboundMessagesOnPBH =
  await polkadotBridgeHubApi.query.BridgeKusamaMessages.OutboundMessages.getValue(messageKey);
const outboundMessagesAsBytesOnPBH = outboundMessagesOnPBH!.asBytes();

const codecsOnPBH = await getTypedCodecs(PolkadotBridgeHub);
const bridgeMessageOnPBH =
  codecsOnPBH.apis.XcmPaymentApi.query_xcm_weight.args.dec(outboundMessagesAsBytesOnPBH.slice(9));
const bridgeMessage = bridgeMessageOnPBH[0];
```

This reveals the **exact XCM payload** queued for delivery to Kusama.

### 3️⃣ Adjust Origin Context Before Replay

Because Chopsticks runs independent runtimes, the inbound message on Kusama side lacks context like `DescendOrigin(PalletInstance(ForeignAssets))`.
We inject that manually:

```ts
const instructions = bridgeMessage.value as XcmV5Instruction[];
bridgeMessage.value = [
  XcmV5Instruction.DescendOrigin(
    XcmV5Junctions.X1(XcmV5Junction.PalletInstance(foreignAssetsPallet.index)),
  ),
  ...instructions,
];
```

This shapes the origin correctly for execution on Kusama Asset Hub.

### 4️⃣ Dry-Run on Kusama Asset Hub

```ts
const dryRunResultOnKAHFromKBH: any = await kusamaAssetHubApi.apis.DryRunApi.dry_run_xcm(
  XcmVersionedLocation.V5({
    parents: 1,
    interior: XcmV5Junctions.X1(XcmV5Junction.Parachain(1002)),
  }),
  bridgeMessage,
);
expect(dryRunResultOnKAHFromKBH.value.execution_result.success).toBe(true);
```

This simulates what would happen **after the real bridge relay** - verifying that the destination chain can decode and execute the XCM as expected.

## 🚧 Why This Is Hard

| Problem                       | Description                                                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Cross-Relay State**         | Light clients & finality proofs are not available off-chain, so the `receive_messages_proof` logic can't complete.        |
| **Origin Context**            | The inbound XCM needs its origin reshaped (`DescendOrigin`) to match the correct pallet index on the destination runtime. |
| **Bridged Storage Isolation** | Each Chopsticks node holds its own isolated storage; bridge queues (`OutboundMessages`, `InboundLanes`) don't auto-sync.  |
| **Proof Encoding**            | Bridge proofs contain opaque SCALE-encoded payloads with versioned metadata, which change per runtime version.            |
| **Version Skew**              | Polkadot & Kusama often run different runtime versions, complicating message codec alignment.                             |

## 🧠 Summary

Testing **XCM over Bridge** locally requires **manual reconstruction of the message flow**, because the **bridge proof-verification path** is not reproducible in a single off-chain environment.

The current workaround is a **hybrid test**:

* Execute & decode the outbound message on Polkadot side
* Adjust and dry-run the decoded XCM on the Kusama side

This validates **XCM correctness**, **fee weight**, and **destination execution logic**, even though the full **trustless relay proof path** cannot yet be automated.
