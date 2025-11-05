# 📘 XCM over Bridges Transaction Walkthrough

## Transaction

* **Hash:** [`0xd0d7ca77002dd6a13f4fc500f9c072393e5821570f17ecbb1364ccfb6544d4d8`](https://xcscan.io/tx/#0xd0d7ca77002dd6a13f4fc500f9c072393e5821570f17ecbb1364ccfb6544d4d8)
* **Sent:** 2025-11-05 04:04:24 GMT
* **Received:** 2025-11-05 04:12:54 GMT (+8m 30s)
* **From:** Polkadot Asset Hub (`13b6hRRY…hySp3hMN`)
* **To:** Kusama Asset Hub (`FARDQWM9…dgdncY1W`)
* **Asset:** 317.13 KSM

## 🔗 Overview

This cross-ecosystem transfer uses the **Polkadot ↔ Kusama bridge**, which connects the two relay chains via their respective **Bridge Hubs**. XCMs travel in **three legs**:

1. **Polkadot Asset Hub → Polkadot Bridge Hub (within Polkadot)**
2. **Polkadot Bridge Hub ↔ Kusama Bridge Hub (cross-relay delivery via trustless relayers and on-chain verification)**
3. **Kusama Bridge Hub → Kusama Asset Hub (within Kusama)**

## 🦴 Leg 1 - Polkadot Asset Hub → Polkadot Bridge Hub

**Duration:** +0m 24s

|               | Polkadot Asset Hub            | Polkadot Bridge Hub      |
| ------------- | ----------------------------- | ------------------------ |
| **Block**     | 10265959 @ 04:04:24           | 6329124 @ 04:04:48       |
| **Tx Hash**   | `0xe416…8d1b57`               |                          |
| **Extrinsic** | `PolkadotXcm.transfer_assets` |                          |
| **Event**     | `XcmpQueue.XcmpMessageSent`   | `MessageQueue.Processed` |

**Description:**

This is a local XCM sent over the **XCMP** channel within the Polkadot network. It withdraws the KSM-backed asset from the sender's account and forwards an XCM to the [**XcmOverBridgeHubKusama**](https://paritytech.github.io/polkadot-sdk/master/pallet_xcm_bridge_hub/) router pallet on the Polkadot Bridge Hub, preparing it for cross-relay delivery to Kusama.

Execution steps:

1. `PolkadotXcm::transfer_assets` constructs the [XCM payload](https://assethub-polkadot.subscan.io/extrinsic/0xe4167762d698c829d9d80e4b43f974623d1bca04601327db4af7ffa8e68d1b57).
2. `XcmpQueue` [handles](https://assethub-polkadot.subscan.io/block/10265959) parachain-to-parachain delivery inside Polkadot.
3. The **bridge messages pallet** on the Bridge Hub [receives and queues](https://bridgehub-polkadot.subscan.io/block/6329124) the message as an **outbound bridge transfer**, to be relayed trustlessly to Kusama.

## 🦴 Leg 2 - Polkadot Bridge Hub ↔ Kusama Bridge Hub

**Duration:** +7m 54s

Here's your data reformatted to match that exact table style and structure:

|               | Polkadot Bridge Hub                    | Kusama Bridge Hub                               |
| ------------- | -------------------------------------- | ----------------------------------------------- |
| **Block**     | 6329124 @ 04:04:48                     | 6896364 @ 04:12:42                              |
| **Tx Hash**   |                                        | `0x6d9e…eb5cf3`                                 |
| **Extrinsic** |                                        | `BridgePolkadotMessages.receive_messages_proof` |
| **Event**     | `BridgeKusamaMessages.MessageAccepted` | `BridgePolkadotMessages.MessagesReceived`       |

**Description:**

This leg represents the **cross-relay bridge delivery**, handled by the **Bridge Messages pallet** within the Polkadot ↔ Kusama trustless bridge system.

Execution steps:

1. The message is [stored](https://bridgehub-polkadot.subscan.io/block/6329124) on **Polkadot BH** as an *undelivered* outbound message (`MessageAccepted` event).
2. [**Relayers**](https://wiki.polkadot.com/learn/learn-dot-ksm-bridge/#polkadot-and-kusama-bridge-relayers) — off-chain processes that connect to both chains — observe finalised Polkadot headers and relay them to the **Kusama BH's on-chain light client**.
3. A relayer then [submits](https://bridgehub-kusama.subscan.io/block/6896364) a `receive_messages_proof` transaction on **Kusama BH**, including a verified proof of the outbound message from Polkadot BH.
4. Once verified and finalised, the message becomes *delivered* (`MessagesReceived` event).

This step bridges **finality and message proofs** between the two relay chains through **trustless relayers** and **on-chain verification**, rather than any trusted off-chain intermediary.

## 🦴 Leg 3 - Kusama Bridge Hub → Kusama Asset Hub

**Duration:** +0m 12s

|               | Kusama Bridge Hub                               | Kusama Asset Hub         |
| ------------- | ----------------------------------------------- | ------------------------ |
| **Block**     | 6896364 @ 04:12:42                              | 11520082 @ 04:12:54      |
| **Extrinsic** | `BridgePolkadotMessages.receive_messages_proof` |                          |
| **Event**     | `XcmpQueue.XcmpMessageSent`                     | `MessageQueue.Processed` |

**Description:**

Once the message arrives on **Kusama BH**, it is rewrapped into a new **XCM** instruction for **intra-Kusama delivery** to Kusama AH.

Execution steps:

1. `BridgePolkadotMessages.receive_messages_proof` [dispatches](https://bridgehub-kusama.subscan.io/block/6896364) the verified message to `XcmpQueue`.
2. The **Kusama Relay Chain** routes the XCMP packet to **Kusama AH**.
3. Kusama AH [executes](https://assethub-kusama.subscan.io/block/11520082) `DepositAsset`, crediting 317.13 KSM to the destination account.
4. The message is marked *processed* (`MessageQueue.Processed` event) and the transfer is complete.

## ⏱ End-to-End Timing

| Leg       | From → To                 | Duration       |
| --------- | ------------------------- | -------------- |
| 1         | Polkadot AH → Polkadot BH | 24 s           |
| 2         | Polkadot BH → Kusama BH   | 7 m 54 s       |
| 3         | Kusama BH → Kusama AH     | 12 s           |
| **Total** |                           | **≈ 8 m 30 s** |

## 🧩 Bridge Components Involved

| Chain               | Parachain | Role                                 |
| ------------------- | --------- | ------------------------------------ |
| Polkadot Asset Hub  | 1000      | XCM origin                           |
| Polkadot Bridge Hub | 1002      | Outbound bridge messages source      |
| Kusama Bridge Hub   | 1002      | Inbound bridge messages target       |
| Kusama Asset Hub    | 1000      | Final beneficiary & asset dispatcher |

## 🧠 Conceptual Summary

* **XCM (Cross-Consensus Messaging)** handles *intra-ecosystem* parachain messaging.
* **Bridge Messages Pallet** handles *cross-relay* delivery between Polkadot and Kusama.
* **Relayers** act as the trusted off-chain messengers that prove and submit message deliveries.
* Once the bridge message is finalised on both sides, the receiving hub emits `XcmpMessageSent` to continue local routing.
* Final confirmation (`MessageQueue.Processed`) marks successful XCM execution and asset credit.
