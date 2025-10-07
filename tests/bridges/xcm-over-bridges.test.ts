import { withExpect } from "@acala-network/chopsticks-testing";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createClient,
  Binary,
  Enum,
  type BlockInfo,
  type PolkadotClient,
} from "polkadot-api";
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
import { ss58Address } from "@polkadot-labs/hdkd-helpers";
import { deriveAlice, toHuman } from "../../src/helper.js";

const { checkHex, checkHrmp } = withExpect(expect);
const XCM_VERSION = 5;
const MAX_RETRIES = 8; // Number of attempts to wait for block finalisation
const KUSAMA_BH = "ws://localhost:8001";
const POLKADOT_AH = "ws://localhost:8003";
const POLKADOT_BH = "ws://localhost:8004";

let kusamaBridgeHubClient: PolkadotClient;
let polkadotAssetHubClient: PolkadotClient;
let polkadotBridgeHubClient: PolkadotClient;

let kusamaBridgeHubApi: any;
let polkadotAssetHubApi: any;
let polkadotBridgeHubApi: any;

let kusamaBridgeHubCurrentBlock: BlockInfo;
let polkadotAssetHubCurrentBlock: BlockInfo;
let polkadotBridgeHubCurrentBlock: BlockInfo;

async function createRpcClient(endpoint: string) {
  const provider = new WsProvider(endpoint) as ProviderInterface;
  const rpcClient: any = await ApiPromise.create({
    provider: provider,
  });
  await rpcClient.isReady;

  return rpcClient;
}

async function getSafeXcmVersion(api: any) {
  return await api.query.PolkadotXcm.SafeXcmVersion.getValue();
}

async function getSupportedVersions(api: any) {
  return await api.query.PolkadotXcm.SupportedVersion.getEntries();
}

async function waitForNextBlock(
  client: PolkadotClient,
  currentBlock: BlockInfo,
) {
  for (let i = 0; i < MAX_RETRIES; i++) {
    const nextBlock = await client.getFinalizedBlock();
    if (nextBlock.number > currentBlock.number) {
      return nextBlock;
    }

    const waiting = 1_000 * 2 ** i;
    console.log(
      `Waiting ${waiting / 1_000}s for the next block to be finalised (${i + 1}/${MAX_RETRIES})...`,
    );
    await new Promise((resolve) => setTimeout(resolve, waiting));
  }

  return currentBlock;
}

function createApiClient(endpoint: string) {
  return createClient(withPolkadotSdkCompat(getWsProvider(endpoint)));
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

  kusamaBridgeHubCurrentBlock = await kusamaBridgeHubClient.getFinalizedBlock();
  polkadotAssetHubCurrentBlock =
    await polkadotAssetHubClient.getFinalizedBlock();
  polkadotBridgeHubCurrentBlock =
    await polkadotBridgeHubClient.getFinalizedBlock();
});

afterAll(async () => {
  kusamaBridgeHubClient?.destroy?.();
  polkadotAssetHubClient?.destroy?.();
  polkadotBridgeHubClient?.destroy?.();
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
      console.error("Local Dry Run failed on PolkadotAssetHub!");
      console.log(
        "Dry Run XCM on PolkadotAssetHub:",
        JSON.stringify(decodedCall, toHuman, 2),
      );
      console.log(
        "Dry Run Result on PolkadotAssetHub:",
        JSON.stringify(dryRunResult.value, toHuman, 2),
      );
    }
    expect(dryRunResult.success).toBe(true);
    expect(executionResult.success).toBe(true);

    const forwarded_xcms: any[] = dryRunResult.value.forwarded_xcms;
    const destination = forwarded_xcms[0][0];
    const remoteMessage = forwarded_xcms[0][1];
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
    expect(remoteMessage).toHaveLength(1);

    const extrinsic = await tx.signAndSubmit(aliceSigner);
    if (!extrinsic.ok) {
      const dispatchError = extrinsic.dispatchError;
      if (dispatchError.type === "Module") {
        const modErr: any = dispatchError.value;
        console.error(
          `Dispatch error in module on PolkadotAssetHub: ${modErr.type} → ${modErr.value?.type}`,
        );
      } else {
        console.error(
          "Dispatch error on PolkadotAssetHub:",
          JSON.stringify(dispatchError, toHuman, 2),
        );
      }
    }
    expect(extrinsic.ok).toBe(true);

    const polkadotAssetHubNextBlock = await waitForNextBlock(
      polkadotAssetHubClient,
      polkadotAssetHubCurrentBlock,
    );
    expect(polkadotAssetHubNextBlock.number).toBeGreaterThan(
      polkadotAssetHubCurrentBlock.number,
    );

    const transferEvents: any[] =
      await polkadotAssetHubApi.event.Balances.Transfer.pull();
    expect(transferEvents.length).greaterThanOrEqual(1);
    expect(transferEvents.at(-1).payload.amount).toBe(100_000n);

    const xcmpMessageSentEvents: any[] =
      await polkadotAssetHubApi.event.XcmpQueue.XcmpMessageSent.pull();
    expect(xcmpMessageSentEvents.length).greaterThanOrEqual(1);

    const sentEvents: any[] =
      await polkadotAssetHubApi.event.PolkadotXcm.Sent.pull();
    expect(sentEvents.length).greaterThanOrEqual(1);
    const sentEvent = sentEvents[sentEvents.length - 1].payload;
    expect(sentEvent.destination).toStrictEqual({
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
    });

    const polkadotAssetHubRpcClient: any = await createRpcClient(POLKADOT_AH);
    const hrmpOutboundMessagesOnAH = await checkHrmp({
      api: polkadotAssetHubRpcClient,
    }).value();
    // console.log(
    //   "HRMP Outbound Messages on PolkadotAssetHub:",
    //   JSON.stringify(hrmpOutboundMessagesOnAH, toHuman, 2),
    // );
    expect(hrmpOutboundMessagesOnAH).toBeDefined();
    const outboundMessagesOnAH: any[] = hrmpOutboundMessagesOnAH[0].data[1].v5;
    const topicId = outboundMessagesOnAH.at(-1).setTopic;

    const polkadotBridgeHubNextBlock = await waitForNextBlock(
      polkadotBridgeHubClient,
      polkadotBridgeHubCurrentBlock,
    );
    expect(polkadotBridgeHubNextBlock.number).toBeGreaterThan(
      polkadotBridgeHubCurrentBlock.number,
    );

    const messageAcceptedEvents: any[] =
      await polkadotBridgeHubApi.event.BridgeKusamaMessages.MessageAccepted.pull();
    expect(messageAcceptedEvents.length).greaterThanOrEqual(1);

    const processedEvents: any[] =
      await polkadotBridgeHubApi.event.MessageQueue.Processed.pull();
    expect(processedEvents.length).greaterThanOrEqual(1);
    const processedEvent = processedEvents[processedEvents.length - 1].payload;
    expect(processedEvent.id.asHex()).eq(topicId);

    const messageKey = messageAcceptedEvents.at(-1).payload;
    const outboundMessagesOnBH =
      await polkadotBridgeHubApi.query.BridgeKusamaMessages.OutboundMessages.getValue(
        messageKey,
      );
    // console.log(
    //   "Outbound Messages on PolkadotBridgeHub:",
    //   JSON.stringify(outboundMessagesOnBH, toHuman, 2),
    // );
    expect(outboundMessagesOnBH).toBeDefined();

    // const callDataOnBH = Binary.fromHex(outboundMessagesOnBH);
    // const txOnBH: any = await polkadotBridgeHubApi.txFromCallData(callDataOnBH);
    // const decodedCallOnBH: any = txOnBH.decodedCall;
    // const polkadotBridgeHubRpcClient = await createRpcClient(POLKADOT_BH);
    const decodedCallOnBH: any = checkHex(outboundMessagesOnBH);
    console.log(
      "Dry Run XCM on PolkadotBridgeHub:",
      JSON.stringify(decodedCallOnBH, toHuman, 2),
    );
    // const dryRunResultOnBH: any =
    //   await polkadotBridgeHubApi.apis.DryRunApi.dry_run_call(
    //     origin,
    //     decodedCallOnBH,
    //     XCM_VERSION,
    //   );
    // console.log(
    //   "Dry Run Result on PolkadotBridgeHub:",
    //   JSON.stringify(dryRunResultOnBH.value, toHuman, 2),
    // );
  });
});
