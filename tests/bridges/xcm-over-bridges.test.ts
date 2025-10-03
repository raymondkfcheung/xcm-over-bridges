import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider";
import { withPolkadotSdkCompat } from "polkadot-api/polkadot-sdk-compat";
import { KusamaBridgeHub, PolkadotBridgeHub } from "@polkadot-api/descriptors";

const KUSAMA_BH = "ws://localhost:8001";
const POLKADOT_BH = "ws://localhost:8004";

let kusamaBridgeHubClient: any;
let polkadotBridgeHubClient: any;
let kusamaBridgeHubApi: any;
let polkadotBridgeHubApi: any;

function getSafeXcmVersion(api: any) {
  const hasPolkadotXcm = api.query?.PolkadotXcm?.SafeXcmVersion;
  const hasXcmPallet = api.query?.XcmPallet?.SafeXcmVersion;
  if (hasPolkadotXcm) return api.query.PolkadotXcm.SafeXcmVersion.getValue();
  if (hasXcmPallet) return api.query.XcmPallet.SafeXcmVersion.getValue();
  return Promise.resolve(null);
}

beforeAll(async () => {
  kusamaBridgeHubClient = createClient(
    withPolkadotSdkCompat(getWsProvider(KUSAMA_BH)),
  );
  polkadotBridgeHubClient = createClient(
    withPolkadotSdkCompat(getWsProvider(POLKADOT_BH)),
  );

  kusamaBridgeHubApi = kusamaBridgeHubClient.getTypedApi(KusamaBridgeHub);
  polkadotBridgeHubApi = polkadotBridgeHubClient.getTypedApi(PolkadotBridgeHub);
});

afterAll(async () => {
  await kusamaBridgeHubClient?.destroy?.();
  await polkadotBridgeHubClient?.destroy?.();
});

describe("XCM Over Bridges Test", () => {
  it("reads SafeXcmVersion on both Bridge Hubs", async () => {
    const kusamaBHVer = await getSafeXcmVersion(kusamaBridgeHubApi);
    const polkadotBHVer = await getSafeXcmVersion(polkadotBridgeHubApi);

    console.log({ kusamaVer: kusamaBHVer, polkadotVer: polkadotBHVer });

    expect(kusamaBHVer).toBeDefined();
    expect(polkadotBHVer).toBeDefined();
    expect(kusamaBHVer).toEqual(polkadotBHVer);
  });
});
