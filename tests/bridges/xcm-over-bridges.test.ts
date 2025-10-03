import { withExpect, setupContext } from "@acala-network/chopsticks-testing";
import { describe, expect, it } from "vitest";
import { ApiPromise, WsProvider } from "@polkadot/api";
import type { ProviderInterface } from "@polkadot/rpc-provider/types";

// Create testing utilities with your test runner's expect function
const { check, checkHrmp, checkSystemEvents, checkUmp } = withExpect(expect);
const endpoint = "wss://polkadot-bridge-hub-rpc.polkadot.io"; // Remote
// const endpoint = "ws://localhost:8000"; // KusamaAssetHub
// const endpoint = "ws://localhost:8001"; // KusamaBridgeHub
// const endpoint = "ws://localhost:8003"; // PolkadotAssetHub
// const endpoint = "ws://localhost:8004"; // PolkadotBridgeHub
const provider = new WsProvider(endpoint) as ProviderInterface;

describe("XCM Testing", () => {
  it("should check UMP messages", async () => {
    const api = await ApiPromise.create({ provider });
    await api.isReady;
    await checkUmp({ api }).redact().toMatchSnapshot("upward messages");
  });

  it("should check HRMP messages", async () => {
    const api = await ApiPromise.create({ provider });
    await api.isReady;
    await checkHrmp({ api }).redact().toMatchSnapshot("horizontal messages");
  });
});
