import { withExpect } from "@acala-network/chopsticks-testing";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  Binary,
  Enum,
  type BlockInfo,
  type PolkadotClient,
  type Transaction,
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

    // Replicate `test_dry_run_transfer_across_pk_bridge`
    // https://github.com/paritytech/polkadot-sdk/pull/6002
    const origin = Enum("system", Enum("Signed", aliceAddress));
    const txOnPAH: Transaction<any, string, string, any> =
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
    const decodedCallOnPAH: any = txOnPAH.decodedCall;
    const dryRunResultOnPAH: any =
      await polkadotAssetHubApi.apis.DryRunApi.dry_run_call(
        origin,
        decodedCallOnPAH,
        XCM_VERSION,
      );
    const executionResultOnPAH = dryRunResultOnPAH.value.execution_result;
    if (!dryRunResultOnPAH.success || !executionResultOnPAH.success) {
      console.error("Local Dry Run failed on PolkadotAssetHub!");
      console.log(
        "Dry Run XCM on PolkadotAssetHub:",
        prettyString(decodedCallOnPAH),
      );
      console.log(
        "Dry Run Result on PolkadotAssetHub:",
        prettyString(dryRunResultOnPAH.value),
      );
    }
    expect(dryRunResultOnPAH.success).toBe(true);
    expect(executionResultOnPAH.success).toBe(true);

    const forwardedXcms: any[] = dryRunResultOnPAH.value.forwarded_xcms;
    const destination = forwardedXcms[0][0];
    const remoteMessages: XcmVersionedXcm[] = forwardedXcms[0][1];
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
    const remoteMessage: any = remoteMessages[0];
    const exportMessage = remoteMessage.value.at(-2);
    expect(exportMessage.type).eq("ExportMessage");
    expect(exportMessage.value.network.type).eq("Kusama");
    expect(exportMessage.value.xcm.at(-1).type).eq("SetTopic");
    expect(remoteMessage.value.at(-1).type).eq("SetTopic");

    const assetHubAsSeenByBridgeHub = XcmVersionedLocation.V5({
      parents: 1,
      interior: XcmV5Junctions.X1(XcmV5Junction.Parachain(1000)),
    });

    const dryRunResultOnPBH: any =
      await polkadotBridgeHubApi.apis.DryRunApi.dry_run_xcm(
        assetHubAsSeenByBridgeHub,
        remoteMessage as XcmVersionedXcm,
      );
    const executionResultOnPBH = dryRunResultOnPBH.value.execution_result;
    const executionSuccessOnPBH =
      executionResultOnPBH?.success == true ||
      executionResultOnPBH?.type === "Complete";
    if (!dryRunResultOnPBH.success || !executionSuccessOnPBH) {
      console.log(
        "Dry Run Remote Message on PolkadotBridgeHub:",
        prettyString(remoteMessage),
      );
      console.log(
        "Dry Run Result on PolkadotBridgeHub:",
        prettyString(dryRunResultOnPBH.value),
      );
    }
    expect(dryRunResultOnPBH.success).toBe(true);
    expect(executionSuccessOnPBH).toBe(true);
    const dryRunEmittedEventsOnPBH: any[] =
      dryRunResultOnPBH.value.emitted_events;
    // console.log(
    //   "Dry Run Emitted Events on PolkadotBridgeHub:",
    //   prettyString(dryRunEmittedEventsOnPBH),
    // );
    const dryRunMessageAcceptedEventOnPBH = dryRunEmittedEventsOnPBH.find(
      (event) =>
        event.type === "BridgeKusamaMessages" &&
        event.value.type === "MessageAccepted",
    );
    expect(dryRunMessageAcceptedEventOnPBH).toBeDefined();

    const extrinsicOnPAH = await txOnPAH.signAndSubmit(aliceSigner);
    if (!extrinsicOnPAH.ok) {
      const dispatchError = extrinsicOnPAH.dispatchError;
      if (dispatchError.type === "Module") {
        const modErr: any = dispatchError.value;
        console.error(
          `Dispatch Error in Module on PolkadotAssetHub: ${modErr.type} → ${modErr.value?.type}`,
        );
      } else {
        console.error(
          "Dispatch Error on PolkadotAssetHub:",
          prettyString(dispatchError),
        );
      }
    }
    expect(extrinsicOnPAH.ok).toBe(true);

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

    // Hack: `OutboundMessages` encodes `BridgeMessage { universal_dest, message }`.
    // https://paritytech.github.io/polkadot-sdk/master/staging_xcm_builder/struct.BridgeMessage.html
    // https://github.com/AcalaNetwork/acala-types.js/blob/master/packages/types/src/interfaces/lookup.ts
    const polkadotBridgeHubRpcClient = await createRpcClient(POLKADOT_BH);
    const outboundMessagesAsBytesOnPBH = outboundMessagesOnPBH!.asBytes();
    // Decode `universal_dest` with the first part as `StagingXcmV5Junction`.
    // Byte 0: https://paritytech.github.io/polkadot-sdk/master/staging_xcm/enum.VersionedInteriorLocation.html
    // Byte 1: Ignore
    // Byte 2: VersionedInteriorLocation::V5
    expect(outboundMessagesAsBytesOnPBH[2]).toBe(5);
    // Byte 3: Junctions::X2
    expect(outboundMessagesAsBytesOnPBH[3]).toBe(2);
    const universalDestX2_0 = polkadotBridgeHubRpcClient.createType(
      "StagingXcmV5Junction",
      outboundMessagesAsBytesOnPBH[3],
    );
    expect(prettyString(universalDestX2_0)).eq(
      prettyString({
        accountIndex64: {
          network: null,
          index: 0,
        },
      }),
    );
    // Bytes 4: Junction::GlobalConsensus
    // Bytes 5: NetworkId::Kusama
    const universalDestX2_1 = polkadotBridgeHubRpcClient.createType(
      "StagingXcmV5Junction",
      outboundMessagesAsBytesOnPBH.slice(4, 6),
    );
    expect(prettyString(universalDestX2_1)).eq(
      prettyString({
        globalConsensus: {
          kusama: null,
        },
      }),
    );
    // Bytes 6: Junction::Parachain
    // Bytes 7-8: compact(1000) => ParaId 1000
    const universalDestX2_2 = polkadotBridgeHubRpcClient.createType(
      "StagingXcmV5Junction",
      outboundMessagesAsBytesOnPBH.slice(6, 9),
    );
    expect(prettyString(universalDestX2_2)).eq(
      prettyString({
        parachain: 1000,
      }),
    );
    // Decode `message` with the rest as `XcmVersionedXcm`.
    // Byte 9+: https://paritytech.github.io/polkadot-sdk/master/staging_xcm/enum.VersionedXcm.html
    const bridgeMessageMessage = polkadotBridgeHubRpcClient.createType(
      "XcmVersionedXcm",
      outboundMessagesAsBytesOnPBH.slice(9),
    );

    const bridgeMessageOnPBH = {
      universal_dest: {
        v5: {
          x2: [universalDestX2_1, universalDestX2_2],
        },
      },
      message: bridgeMessageMessage,
    };
    console.log(
      "Bridge Message on PolkadotBridgeHub:",
      prettyString(bridgeMessageOnPBH),
    );

    // const weight: any =
    //   await polkadotBridgeHubApi.apis.XcmPaymentApi.query_xcm_weight(
    //     remoteMessage,
    //   );
    // if (!weight.success) {
    //   console.error(
    //     "Failed to query XCM weight on PolkadotBridgeHub:",
    //     weight.error,
    //   );
    // }
    // expect(weight.success).toBe(true);

    // const txOnPBH: Transaction<any, string, string, any> =
    //   polkadotBridgeHubApi.tx.PolkadotXcm.execute({
    //     message: remoteMessage,
    //     max_weight: weight.value,
    //   });
    // const extrinsicOnPBH = await txOnPBH.signAndSubmit(aliceSigner);
    // if (!extrinsicOnPBH.ok) {
    //   const dispatchError = extrinsicOnPBH.dispatchError;
    //   if (dispatchError.type === "Module") {
    //     const modErr: any = dispatchError.value;
    //     console.error(
    //       `Dispatch Error in Module on PolkadotBridgeHub: ${modErr.type} → ${modErr.value?.type}`,
    //     );
    //   } else {
    //     console.error(
    //       "Dispatch Error on PolkadotBridgeHub:",
    //       prettyString(dispatchError),
    //     );
    //   }
    // }
    // expect(extrinsicOnPBH.ok).toBe(true);
    // runtime::bridge-xcm  ERROR: [32] No opened bridge for requested bridge_origin_relative_location: Location { parents: 0, interior: X1([AccountId32 { network: Some(Polkadot), id: [212, 53, 147, 199, 21, 253, 211, 28, 97, 20, 26, 189, 4, 169, 159, 214, 130, 44, 133, 88, 133, 76, 205, 227, 154, 86, 132, 231, 165, 109, 162, 125] }]) } and bridge_destination_universal_location: X2([GlobalConsensus(Kusama), Parachain(1000)])
    // xcm::pallet_xcm::execute  ERROR: [32] XCM execution failed with error error=InstructionError { index: 3, error: Unroutable }
  });
});
