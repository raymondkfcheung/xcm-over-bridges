import { describe, it, expect } from "vitest";
import { createClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider";
import { withPolkadotSdkCompat } from "polkadot-api/polkadot-sdk-compat";
import { ApiPromise, WsProvider } from "@polkadot/api";
import { KusamaBridgeHub, PolkadotBridgeHub } from "@polkadot-api/descriptors";

const KUSAMA_BH = "ws://localhost:8001";
const POLKADOT_BH = "ws://localhost:8004";

async function getSafeXcmVersion(descriptor: any, endpoint: string) {
  const provider = getWsProvider(endpoint);
  const client = createClient(withPolkadotSdkCompat(provider));
  const api: any = client.getTypedApi(descriptor);

  // Pallet may be named PolkadotXcm or XcmPallet depending on runtime
  const hasPolkadotXcm = api.query?.PolkadotXcm?.SafeXcmVersion;
  const hasXcmPallet = api.query?.XcmPallet?.SafeXcmVersion;

  const ver = hasPolkadotXcm
    ? await api.query.PolkadotXcm.SafeXcmVersion.getValue()
    : hasXcmPallet
      ? await api.query.XcmPallet.SafeXcmVersion.getValue()
      : null;

  client.destroy();

  return ver;
}

describe("XCM Over Bridges Test", () => {
  it("reads SafeXcmVersion on both Bridge Hubs", async () => {
    const kusamaVer = await getSafeXcmVersion(KusamaBridgeHub, KUSAMA_BH);
    const polkadotVer = await getSafeXcmVersion(PolkadotBridgeHub, POLKADOT_BH);

    console.log({ kusamaVer, polkadotVer });

    expect(kusamaVer).toBeDefined();
    expect(polkadotVer).toBeDefined();

    expect(kusamaVer).toEqual(polkadotVer);
  });
});
