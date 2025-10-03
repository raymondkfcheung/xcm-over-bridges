import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider";
import { withPolkadotSdkCompat } from "polkadot-api/polkadot-sdk-compat";
import { KusamaBridgeHub, PolkadotBridgeHub } from "@polkadot-api/descriptors";
import toHuman from "../../src/helper.js";

const XCM_VERSION = 5;
const KUSAMA_BH = "ws://localhost:8001";
const POLKADOT_BH = "ws://localhost:8004";

let kusamaBridgeHubClient: any;
let polkadotBridgeHubClient: any;
let kusamaBridgeHubApi: any;
let polkadotBridgeHubApi: any;

async function getSafeXcmVersion(api: any) {
  return await api.query.PolkadotXcm.SafeXcmVersion.getValue();
}

async function getSupportedVersions(api: any) {
  return await api.query.PolkadotXcm.SupportedVersion.getEntries();
}

function supportsV5ForOtherChain(
  entries: any[],
  otherConsensus: String,
  otherParaId: number,
) {
  return entries.some(
    (e) =>
      e?.keyArgs?.[0] === XCM_VERSION &&
      e?.keyArgs?.[1]?.type === "V5" &&
      e?.keyArgs?.[1]?.value?.parents === 2 &&
      e?.keyArgs?.[1]?.value?.interior?.type === "X2" &&
      Array.isArray(e?.keyArgs?.[1]?.value?.interior?.value) &&
      e.keyArgs[1].value.interior.value[0]?.type === "GlobalConsensus" &&
      e.keyArgs[1].value.interior.value[0]?.value?.type === otherConsensus &&
      e.keyArgs[1].value.interior.value[1]?.type === "Parachain" &&
      e.keyArgs[1].value.interior.value[1]?.value === otherParaId &&
      (e?.value ?? 0) >= XCM_VERSION,
  );
}

it("asserts both Bridge Hubs advertise support for XCM v5 to each other", async () => {
  const kusamaBHVers = await getSupportedVersions(kusamaBridgeHubApi);
  const polkadotBHVers = await getSupportedVersions(polkadotBridgeHubApi);

  const kusamaSaysPolkadotBHv5 = supportsV5ForOtherChain(
    kusamaBHVers,
    "Polkadot",
    1002,
  );
  const polkadotSaysKusamaBHv5 = supportsV5ForOtherChain(
    polkadotBHVers,
    "Kusama",
    1002,
  );

  expect(kusamaSaysPolkadotBHv5).toBe(true);
  expect(polkadotSaysKusamaBHv5).toBe(true);
});

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

describe("XCM Over Bridges Tests", () => {
  it("reads SafeXcmVersion on both Bridge Hubs", async () => {
    const kusamaBHVer: number = await getSafeXcmVersion(kusamaBridgeHubApi);
    const polkadotBHVer: number = await getSafeXcmVersion(polkadotBridgeHubApi);

    expect(kusamaBHVer).toBeDefined();
    expect(polkadotBHVer).toBeDefined();
    expect(kusamaBHVer).toEqual(polkadotBHVer);
    expect(kusamaBHVer).lessThanOrEqual(XCM_VERSION);
    expect(polkadotBHVer).lessThanOrEqual(XCM_VERSION);
  });

  it("reads SupportedVersion on both Bridge Hubs", async () => {
    const kusamaBHVers = await getSupportedVersions(kusamaBridgeHubApi);
    const polkadotBHVers = await getSupportedVersions(polkadotBridgeHubApi);

    expect(kusamaBHVers).toBeDefined();
    expect(polkadotBHVers).toBeDefined();

    const kusamaSaysPolkadotBHv5 = supportsV5ForOtherChain(
      kusamaBHVers,
      "Polkadot",
      1002,
    );
    if (!kusamaSaysPolkadotBHv5) {
      console.log(JSON.stringify(kusamaBHVers, toHuman, 2));
    }

    const polkadotSaysKusamaBHv5 = supportsV5ForOtherChain(
      polkadotBHVers,
      "Kusama",
      1002,
    );
    if (!polkadotSaysKusamaBHv5) {
      console.log(JSON.stringify(polkadotBHVers, toHuman, 2));
    }

    expect(kusamaSaysPolkadotBHv5).toBe(true);
    expect(polkadotSaysKusamaBHv5).toBe(true);
  });
});
