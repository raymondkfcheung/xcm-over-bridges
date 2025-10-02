import { withExpect, setupContext } from "@acala-network/chopsticks-testing";
import { describe, expect, it } from "vitest";
import { ApiPromise, WsProvider } from "@polkadot/api";
import type { ProviderInterface } from "@polkadot/rpc-provider/types";

// Create testing utilities with your test runner's expect function
const { check, checkHrmp, checkSystemEvents, checkUmp } = withExpect(expect);
const endpoint = "wss://polkadot-bridge-hub-rpc.polkadot.io"; // Remote
// const endpoint = "ws://localhost:8000"; // Local
const provider = new WsProvider(endpoint) as ProviderInterface;

// https://github.com/AcalaNetwork/chopsticks?tab=readme-ov-file#basic-usage
describe.skip("My Chain Tests", () => {
  it("should process events correctly", async () => {
    const network = await setupContext({ endpoint });
    // Check and redact system events
    await checkSystemEvents(network)
      .redact({ number: 1, hash: true })
      .toMatchSnapshot("system events");

    // Filter specific events
    await checkSystemEvents(network, "balances", {
      section: "system",
      method: "ExtrinsicSuccess",
    }).toMatchSnapshot("filtered events");
  });
});

// https://github.com/AcalaNetwork/chopsticks?tab=readme-ov-file#data-redaction
describe.skip("Data Redaction Tests", () => {
  it("should redact account data", async () => {
    const api = await ApiPromise.create({ provider });

    const accountId = "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY"; // Example account ID
    const accountData = await api.query.system.account(accountId);

    await check(accountData)
      .redact({
        number: 2,
        hash: true,
        address: true,
      })
      .toMatchSnapshot("account data");
  });
});

// https://github.com/AcalaNetwork/chopsticks?tab=readme-ov-file#event-filtering
describe.skip("Event Filtering Tests", () => {
  it("should check all balances events", async () => {
    const network = await setupContext({ endpoint });
    await checkSystemEvents(network, "balances").toMatchSnapshot(
      "balances events",
    );
  });

  it("should check specific event type", async () => {
    const network = await setupContext({ endpoint });
    await checkSystemEvents(network, {
      section: "system",
      method: "ExtrinsicSuccess",
    }).toMatchSnapshot("successful extrinsics");
  });

  it("should apply multiple filters", async () => {
    const network = await setupContext({ endpoint });
    await checkSystemEvents(network, "balances", {
      section: "system",
      method: "ExtrinsicSuccess",
    }).toMatchSnapshot("filtered events");
  });
});

// https://github.com/AcalaNetwork/chopsticks?tab=readme-ov-file#xcm-testing
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

// https://github.com/AcalaNetwork/chopsticks?tab=readme-ov-file#data-format-conversion
describe.skip("Data Format Conversion", () => {
  it("should convert data to human-readable format", async () => {
    const network = await setupContext({ endpoint });
    const data = await network.api.query.system.account(
      "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
    ); // Example data
    await check(data).toHuman().toMatchSnapshot("human readable");
  });

  it("should convert data to hex format", async () => {
    const network = await setupContext({ endpoint });
    const data = await network.api.query.system.account(
      "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
    ); // Example data
    await check(data).toHex().toMatchSnapshot("hex format");
  });

  it("should convert data to JSON format", async () => {
    const network = await setupContext({ endpoint });
    const data = await network.api.query.system.account(
      "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
    ); // Example data
    await check(data).toJson().toMatchSnapshot("json format");
  });
});

// https://github.com/AcalaNetwork/chopsticks?tab=readme-ov-file#custom-transformations
describe("Custom Transformations", () => {
  it("should apply custom transformations", async () => {
    const network = await setupContext({ endpoint });
    const data = await network.api.query.system.events(); // Example data - array of events

    await check(data)
      .map((events) =>
        events.filter((event: any) => {
          // Assuming events have a 'phase' property with a 'value'
          // and the 'value' has an 'amount' property
          return event.phase.value?.amount && event.phase.value.amount > 1000;
        }),
      )
      .redact()
      .toMatchSnapshot("filtered and redacted");
  });
});
