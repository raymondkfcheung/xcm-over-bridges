import { withExpect } from "@acala-network/chopsticks-testing";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, Binary, Enum } from "polkadot-api";
import { getPolkadotSigner } from "polkadot-api/signer";
import { getWsProvider } from "polkadot-api/ws-provider";
import { withPolkadotSdkCompat } from "polkadot-api/polkadot-sdk-compat";
import { ApiPromise, WsProvider } from "@polkadot/api";
import type { ProviderInterface } from "@polkadot/rpc-provider/types";
import {
  KusamaBridgeHub,
  PolkadotAssetHub,
  PolkadotBridgeHub,
  XcmV3MultiassetFungibility,
  XcmV3WeightLimit,
  XcmV5Junction,
  XcmV5Junctions,
  XcmV5NetworkId,
  XcmVersionedAssets,
  XcmVersionedLocation,
} from "@polkadot-api/descriptors";
import { sr25519CreateDerive } from "@polkadot-labs/hdkd";
import {
  DEV_PHRASE,
  entropyToMiniSecret,
  mnemonicToEntropy,
  ss58Address,
} from "@polkadot-labs/hdkd-helpers";
import toHuman from "../../src/helper.js";

const { check, checkHrmp, checkSystemEvents, checkUmp } = withExpect(expect);
const XCM_VERSION = 5;
const KUSAMA_BH = "ws://localhost:8001";
const POLKADOT_AH = "ws://localhost:8003";
const POLKADOT_BH = "ws://localhost:8004";

let kusamaBridgeHubClient: any;
let polkadotAssetHubClient: any;
let polkadotBridgeHubClient: any;
let kusamaBridgeHubApi: any;
let polkadotAssetHubApi: any;
let polkadotBridgeHubApi: any;

async function getSafeXcmVersion(api: any) {
  return await api.query.PolkadotXcm.SafeXcmVersion.getValue();
}

async function getSupportedVersions(api: any) {
  return await api.query.PolkadotXcm.SupportedVersion.getEntries();
}

function createApiClient(endpoint: string) {
  return createClient(withPolkadotSdkCompat(getWsProvider(endpoint)));
}

function deriveAlice() {
  const entropy = mnemonicToEntropy(DEV_PHRASE);
  const miniSecret = entropyToMiniSecret(entropy);
  const derive = sr25519CreateDerive(miniSecret);
  return derive("//Alice");
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

beforeAll(async () => {
  kusamaBridgeHubClient = createApiClient(KUSAMA_BH);
  polkadotAssetHubClient = createApiClient(POLKADOT_AH);
  polkadotBridgeHubClient = createApiClient(POLKADOT_BH);

  kusamaBridgeHubApi = kusamaBridgeHubClient.getTypedApi(KusamaBridgeHub);
  polkadotAssetHubApi = polkadotAssetHubClient.getTypedApi(PolkadotAssetHub);
  polkadotBridgeHubApi = polkadotBridgeHubClient.getTypedApi(PolkadotBridgeHub);
});

afterAll(async () => {
  await kusamaBridgeHubClient?.destroy?.();
  await polkadotAssetHubClient?.destroy?.();
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

  it("transfers across Bridges", async () => {
    const alice = deriveAlice();
    const alicePublicKey = alice.publicKey;
    const aliceSigner = getPolkadotSigner(
      alicePublicKey,
      "Sr25519",
      alice.sign,
    );
    const aliceAddress = ss58Address(alicePublicKey);
    const origin = Enum("system", Enum("Signed", aliceAddress));
    const tx: any =
      polkadotAssetHubApi.tx.PolkadotXcm.limited_reserve_transfer_assets({
        dest: XcmVersionedLocation.V5({
          parents: 2,
          interior: XcmV5Junctions.X2([
            XcmV5Junction.GlobalConsensus(XcmV5NetworkId.Kusama()),
            XcmV5Junction.Parachain(1000),
          ]),
        }),
        beneficiary: XcmVersionedLocation.V5({
          parents: 0,
          interior: XcmV5Junctions.X1(
            XcmV5Junction.AccountId32({
              id: Binary.fromHex(
                "0x9818ff3c27d256631065ecabf0c50e02551e5c5342b8669486c1e566fcbf847f",
              ),
            }),
          ),
        }),
        assets: XcmVersionedAssets.V5([
          {
            id: {
              parents: 1,
              interior: XcmV5Junctions.Here(),
            },
            fun: XcmV3MultiassetFungibility.Fungible(100_000n),
          },
        ]),
        fee_asset_item: 0,
        weight_limit: XcmV3WeightLimit.Unlimited(),
      });
    const decodedCall: any = tx.decodedCall;
    const dryRunResult: any =
      await polkadotAssetHubApi.apis.DryRunApi.dry_run_call(
        origin,
        decodedCall,
        XCM_VERSION,
      );
    const executionResult = dryRunResult.value.execution_result;
    if (!dryRunResult.success || !executionResult.success) {
      console.error("Local Dry Run failed!");
      console.log("Dry Run XCM:", JSON.stringify(decodedCall, toHuman, 2));
      console.log(
        "Dry Run Result:",
        JSON.stringify(dryRunResult.value, toHuman, 2),
      );
    }
    expect(dryRunResult.success).toBe(true);
    expect(executionResult.success).toBe(true);

    const forwarded_xcms: any[] = dryRunResult.value.forwarded_xcms;
    const destination = forwarded_xcms[0][0];
    const messages = forwarded_xcms[0][1];
    expect(destination.value).toStrictEqual({
      parents: 1,
      interior: {
        type: "X1",
        value: {
          type: "Parachain",
          value: 1002,
        },
      },
    });
    expect(messages).toHaveLength(1);

    const extrinsic = await tx.signAndSubmit(aliceSigner);
    if (!extrinsic.ok) {
      const dispatchError = extrinsic.dispatchError;
      if (dispatchError.type === "Module") {
        const modErr: any = dispatchError.value;
        console.error(
          `Dispatch error in module: ${modErr.type} → ${modErr.value?.type}`,
        );
      } else {
        console.error(
          "Dispatch error:",
          JSON.stringify(dispatchError, toHuman, 2),
        );
      }
    }
    expect(extrinsic.ok).toBe(true);

    const transferEvents: any[] =
      await polkadotAssetHubApi.event.Balances.Transfer.pull();
    expect(transferEvents.length).greaterThanOrEqual(1);
    expect(transferEvents[transferEvents.length - 1].payload.amount).toBe(
      100_000n,
    );

    const xcmpMessageSentEvents: any[] =
      await polkadotAssetHubApi.event.XcmpQueue.XcmpMessageSent.pull();
    expect(xcmpMessageSentEvents.length).greaterThanOrEqual(1);

    const sentEvents: any[] =
      await polkadotAssetHubApi.event.PolkadotXcm.Sent.pull();
    expect(sentEvents.length).greaterThanOrEqual(1);
    expect(sentEvents[sentEvents.length - 1].payload.destination).toStrictEqual(
      {
        parents: 2,
        interior: {
          type: "X2",
          value: [
            {
              type: "GlobalConsensus",
              value: {
                type: "Kusama",
                value: undefined,
              },
            },
            {
              type: "Parachain",
              value: 1000,
            },
          ],
        },
      },
    );

    const polkadotAssetHubProvider = new WsProvider(
      POLKADOT_AH,
    ) as ProviderInterface;
    const polkadotAssetHubRpcApi: any = await ApiPromise.create({
      provider: polkadotAssetHubProvider,
    });
    await polkadotAssetHubRpcApi.isReady;
    const hrmpOutboundMessages = await checkHrmp({
      api: polkadotAssetHubRpcApi,
    }).value();
    // const hrmpOutboundMessages = await api.query.parachainSystem.hrmpOutboundMessages();
    console.log(
      "HRMP Outbound Messages:",
      JSON.stringify(hrmpOutboundMessages, toHuman, 2),
    );
  });
});
