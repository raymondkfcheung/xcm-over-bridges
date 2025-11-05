# 📘 XCM over Bridges Transaction Walkthrough

## Transaction

* **Hash:** [`0xd0d7ca77002dd6a13f4fc500f9c072393e5821570f17ecbb1364ccfb6544d4d8`](https://xcscan.io/tx/#0xd0d7ca77002dd6a13f4fc500f9c072393e5821570f17ecbb1364ccfb6544d4d8)
* **Sent:** 2025-11-05 04:04:24 GMT
* **Received:** 2025-11-05 04:12:54 GMT (+8m 30s)
* **From:** Polkadot Asset Hub (`13b6hRRY…hySp3hMN`)
* **To:** Kusama Asset Hub (`FARDQWM9…dgdncY1W`)
* **Asset:** 317.13 KSM

## 🔗 Overview

This cross-ecosystem transfer uses the **Polkadot ↔ Kusama bridge**, which connects the two relay chains via their respective **Bridge Hubs**.
XCM messages travel in **three legs**:

1. **Polkadot Asset Hub → Polkadot Bridge Hub (within Polkadot)**
2. **Polkadot Bridge Hub ↔ Kusama Bridge Hub (cross-relay bridge)**
3. **Kusama Bridge Hub → Kusama Asset Hub (within Kusama)**

## 🦴 Leg 1 - Polkadot Asset Hub → Polkadot Bridge Hub

**Duration:** +0m 24s

| Item            | Details                         |
| --------------- | ------------------------------- |
| **Source**      | Polkadot Asset Hub (para 1000)  |
| **Destination** | Polkadot Bridge Hub (para 1002) |
| **Extrinsic**   | `PolkadotXcm.transfer_assets`   |
| **Event**       | `XcmpQueue.XcmpMessageSent`     |
| **Block**       | #10 265 959 - 04:04:24 GMT      |
| **Tx Hash**     | `0xe416…8d1b57`                 |

**Description:**
This is a local **XCM v5** message sent over the **XCMP** channel inside the Polkadot network.
It withdraws KSM-backed asset from the sender’s account and enqueues a message to the **ToKusama** router on the Bridge Hub for forwarding across the bridge.

**On-chain components:**

* `PolkadotXcm::transfer_assets` constructs the [XCM payload](https://assethub-polkadot.subscan.io/extrinsic/0xe4167762d698c829d9d80e4b43f974623d1bca04601327db4af7ffa8e68d1b57).
* `XcmpQueue` [handles](https://assethub-polkadot.subscan.io/block/10265959) parachain-to-parachain delivery inside Polkadot.
* The **bridge messages pallet** on the Bridge Hub [receives and queues](https://bridgehub-polkadot.subscan.io/block/6329124) it as an **outbound message**.

## 🦴 Leg 2 - Polkadot Bridge Hub ↔ Kusama Bridge Hub

**Duration:** +7m 54s

| Item                  | Details                                                                           |
| --------------------- | --------------------------------------------------------------------------------- |
| **Outbound event**    | `BridgeKusamaMessages.MessageAccepted` (Polkadot BH #6 329 124 @ 04:04:48)        |
| **Inbound extrinsic** | `BridgePolkadotMessages.receive_messages_proof` (Kusama BH #6 896 364 @ 04:12:42) |
| **Event**             | `BridgePolkadotMessages.MessagesReceived`                                         |
| **Duration**          | ≈ 7 min 54 s                                                                      |

**Description:**
This leg represents the **cross-relay bridge delivery**, handled by the **Bridge Messages pallet**.

Sequence:

1. The message is [stored](https://bridgehub-polkadot.subscan.io/block/6329124) on **Polkadot BH** as an *undelivered* outbound message (`MessageAccepted` event).
2. [Off-chain **relayers**](https://wiki.polkadot.com/learn/learn-dot-ksm-bridge/#polkadot-and-kusama-bridge-relayers) watch for these undelivered messages.
3. A relayer [crafts and submits](https://bridgehub-kusama.subscan.io/block/6896364) a `receive_messages_proof` transaction on **Kusama BH**, containing a proof from Polkadot BH.
4. Once finalised, the message becomes *delivered* (`MessagesReceived` event).

This step bridges finality and message proofs between the two relay chains.

## 🦴 Leg 3 - Kusama Bridge Hub → Kusama Asset Hub

**Duration:** +0m 12s

| Item                  | Details                                                       |
| --------------------- | ------------------------------------------------------------- |
| **Outbound event**    | `XcmpQueue.XcmpMessageSent` (Kusama BH #6 896 364 @ 04:12:42) |
| **Relay chain hop**   | Kusama Relay (#30 830 245 @ 04:12:48)                         |
| **Final destination** | Kusama Asset Hub #11 520 082 @ 04:12:54                       |
| **Event**             | `MessageQueue.Processed`                                      |

**Description:**
Once the message arrives on **Kusama Bridge Hub**, it is re-wrapped into a new **XCM V5** instruction for **intra-Kusama delivery** to the Asset Hub parachain.
Execution steps:

1. `BridgePolkadotMessages.receive_messages_proof` triggers dispatch to `XcmpQueue`.
2. The **Kusama Relay Chain** routes the XCMP packet to the **Asset Hub**.
3. The Asset Hub executes `DepositAsset`, crediting 317.13 KSM to the destination account.
4. The message is marked *Processed* and complete.

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
