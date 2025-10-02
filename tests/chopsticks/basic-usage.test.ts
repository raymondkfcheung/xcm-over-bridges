import { withExpect, setupContext } from "@acala-network/chopsticks-testing";
import { describe, expect, it } from "vitest";

const { check, checkEvents, checkSystemEvents, checkUmp, checkHrmp } =
  withExpect(expect);

describe("My Chain Tests", () => {
  it("should process events correctly", async () => {
    const network = await setupContext({
      endpoint: "wss://polkadot-rpc.dwellir.com",
    });

    // Check and redact system events
    await checkSystemEvents(network)
      .redact({ number: 2, hash: true })
      .toMatchSnapshot("system events");

    // Filter specific events
    await checkSystemEvents(network, "balances", {
      section: "system",
      method: "ExtrinsicSuccess",
    }).toMatchSnapshot("filtered events");
  });
});
