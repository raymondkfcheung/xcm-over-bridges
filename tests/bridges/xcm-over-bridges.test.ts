import { withExpect } from "@acala-network/chopsticks-testing";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  Binary,
  Enum,
  type BlockInfo,
  type PolkadotClient,
  type TypedApi,
} from "polkadot-api";
import { getPolkadotSigner } from "polkadot-api/signer";
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
  XcmVersionedXcm,
} from "@polkadot-api/descriptors";
import { ss58Address } from "@polkadot-labs/hdkd-helpers";
import {
  createApiClient,
  createRpcClient,
  deriveAlice,
  prettyString,
  waitForNextBlock,
} from "../../src/helper.js";

const { checkHrmp } = withExpect(expect);
const XCM_VERSION = 5;
const KUSAMA_BH = "ws://localhost:8001";
const POLKADOT_AH = "ws://localhost:8003";
const POLKADOT_BH = "ws://localhost:8004";

let kusamaBridgeHubClient: PolkadotClient;
let polkadotAssetHubClient: PolkadotClient;
let polkadotBridgeHubClient: PolkadotClient;

let kusamaBridgeHubApi: TypedApi<typeof KusamaBridgeHub>;
let polkadotAssetHubApi: TypedApi<typeof PolkadotAssetHub>;
let polkadotBridgeHubApi: TypedApi<typeof PolkadotBridgeHub>;

let kusamaBridgeHubCurrentBlock: BlockInfo;
let polkadotAssetHubCurrentBlock: BlockInfo;
let polkadotBridgeHubCurrentBlock: BlockInfo;

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
      console.log(prettyString(kusamaBHVers));
    }

    const polkadotSaysKusamaBHv5 = supportsV5ForOtherChain(
      polkadotBHVers,
      "Kusama",
      1002,
    );
    if (!polkadotSaysKusamaBHv5) {
      console.log(prettyString(polkadotBHVers));
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
        prettyString(decodedCall),
      );
      console.log(
        "Dry Run Result on PolkadotAssetHub:",
        prettyString(dryRunResult.value),
      );
    }
    expect(dryRunResult.success).toBe(true);
    expect(executionResult.success).toBe(true);

    const forwarded_xcms: any[] = dryRunResult.value.forwarded_xcms;
    const destination = forwarded_xcms[0][0];
    const remoteMessages: XcmVersionedXcm[] = forwarded_xcms[0][1];
    const remoteMessage: any = remoteMessages[0];
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
    expect(remoteMessages).toHaveLength(1);
    expect(remoteMessage.value.at(-2).value.xcm.at(-1).type).eq("SetTopic");
    expect(remoteMessage.value.at(-1).type).eq("SetTopic");

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
          prettyString(dispatchError),
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

    const polkadotAssetHubRpcClient = await createRpcClient(POLKADOT_AH);
    const hrmpOutboundMessagesOnPAH = await checkHrmp({
      api: polkadotAssetHubRpcClient,
    }).value();
    expect(hrmpOutboundMessagesOnPAH).toBeDefined();
    const outboundMessagesOnPAH: any[] =
      hrmpOutboundMessagesOnPAH[0].data[1].v5;
    const topicId = outboundMessagesOnPAH.at(-1).setTopic;

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
    const outboundMessagesOnPBH =
      await polkadotBridgeHubApi.query.BridgeKusamaMessages.OutboundMessages.getValue(
        messageKey,
      );
    expect(outboundMessagesOnPBH).toBeDefined();

    const assetHubAsSeenByBridgeHub = XcmVersionedLocation.V5({
      parents: 1,
      interior: XcmV5Junctions.X1(XcmV5Junction.Parachain(1000)),
    });
    const topicIdAsBinary = Binary.fromHex(topicId);
    remoteMessage.value.at(-2).value.xcm.at(-1).value = topicIdAsBinary;
    remoteMessage.value.at(-1).value = topicIdAsBinary;
    console.log(
      "Dry Run Remote Message on PolkadotBridgeHub:",
      prettyString(remoteMessage),
    );

    const dryRunResultOnPBH: any =
      await polkadotBridgeHubApi.apis.DryRunApi.dry_run_xcm(
        assetHubAsSeenByBridgeHub,
        remoteMessage as XcmVersionedXcm,
      );
    console.log(
      "Dry Run Result on PolkadotBridgeHub:",
      prettyString(dryRunResultOnPBH.value),
    );
  });
});
