import { withExpect } from "@acala-network/chopsticks-testing";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getTypedCodecs,
  Binary,
  Enum,
  type BlockInfo,
  type PolkadotClient,
  type Transaction,
  type TypedApi,
} from "polkadot-api";
import { getPolkadotSigner } from "polkadot-api/signer";
import {
  KusamaAssetHub,
  KusamaBridgeHub,
  PolkadotAssetHub,
  PolkadotBridgeHub,
  XcmV3MultiassetFungibility,
  XcmV3WeightLimit,
  XcmV5Instruction,
  XcmV5Junction,
  XcmV5Junctions,
  XcmV5NetworkId,
  XcmVersionedAssets,
  XcmVersionedLocation,
  XcmVersionedXcm,
} from "@polkadot-api/descriptors";
import { decAnyMetadata } from "@polkadot-api/substrate-bindings";
import { ss58Address } from "@polkadot-labs/hdkd-helpers";
import {
  createApiClient,
  createRpcClient,
  deriveAlice,
  dryRunExecuteXcm,
  dryRunSendXcm,
  prettyString,
  signAndSubmit,
  waitForNextBlock,
} from "../../src/helper.js";

const { checkHrmp } = withExpect(expect);
const XCM_VERSION = 5;
const KUSAMA_AH = "ws://localhost:8000";
const KUSAMA_BH = "ws://localhost:8001";
const POLKADOT_AH = "ws://localhost:8003";
const POLKADOT_BH = "ws://localhost:8004";

let kusamaAssetHubClient: PolkadotClient;
let kusamaBridgeHubClient: PolkadotClient;
let polkadotAssetHubClient: PolkadotClient;
let polkadotBridgeHubClient: PolkadotClient;

let kusamaAssetHubApi: TypedApi<typeof KusamaAssetHub>;
let kusamaBridgeHubApi: TypedApi<typeof KusamaBridgeHub>;
let polkadotAssetHubApi: TypedApi<typeof PolkadotAssetHub>;
let polkadotBridgeHubApi: TypedApi<typeof PolkadotBridgeHub>;

let kusamaAssetHubCurrentBlock: BlockInfo;
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
  kusamaAssetHubClient = createApiClient(KUSAMA_AH);
  kusamaBridgeHubClient = createApiClient(KUSAMA_BH);
  polkadotAssetHubClient = createApiClient(POLKADOT_AH);
  polkadotBridgeHubClient = createApiClient(POLKADOT_BH);

  kusamaAssetHubApi = kusamaAssetHubClient.getTypedApi(KusamaAssetHub);
  kusamaBridgeHubApi = kusamaBridgeHubClient.getTypedApi(KusamaBridgeHub);
  polkadotAssetHubApi = polkadotAssetHubClient.getTypedApi(PolkadotAssetHub);
  polkadotBridgeHubApi = polkadotBridgeHubClient.getTypedApi(PolkadotBridgeHub);

  kusamaAssetHubCurrentBlock = await kusamaAssetHubClient.getFinalizedBlock();
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
    // https://xcscan.io/tx/#0xc1d5f5fd37c54d97a5a98a4fb00ca639c371caf7ca033dd9e2b4bb59d6fddd21
    // https://assethub-polkadot.subscan.io/extrinsic/0xf2e437c26deb63ba069faace67fc47b25c2635ccfaa2b6c22b910e67846d4f03
    const origin = Enum("system", Enum("Signed", aliceAddress));
    const txOnPAH: Transaction<any, string, string, any> =
      polkadotAssetHubApi.tx.PolkadotXcm.transfer_assets({
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
              parents: 0,
              interior: XcmV5Junctions.X2([
                XcmV5Junction.PalletInstance(50),
                XcmV5Junction.GeneralIndex(1984n),
              ]),
            },
            fun: XcmV3MultiassetFungibility.Fungible(1_000_000n),
          },
        ]),
        fee_asset_item: 0,
        weight_limit: XcmV3WeightLimit.Unlimited(),
      });
    const decodedCallOnPAH: any = txOnPAH.decodedCall;
    const dryRunResultOnPAH: any = await dryRunSendXcm(
      "PolkadotAssetHub",
      polkadotAssetHubApi,
      origin,
      decodedCallOnPAH,
    );
    const executionResultOnPAH = dryRunResultOnPAH.value.execution_result;
    expect(dryRunResultOnPAH.success).toBe(true);
    expect(executionResultOnPAH.success).toBe(true);

    const forwardedXcms: any[] = dryRunResultOnPAH.value.forwarded_xcms;
    const destination = forwardedXcms[0][0];
    const remoteMessages: XcmVersionedXcm[] = forwardedXcms[0][1];
    expect(destination.value).toEqual({
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
    expect(exportMessage.type).toEqual("ExportMessage");
    expect(exportMessage.value.network.type).toEqual("Kusama");
    expect(exportMessage.value.xcm.at(-1).type).toEqual("SetTopic");
    expect(remoteMessage.value.at(-1).type).toEqual("SetTopic");

    const assetHubAsSeenByBridgeHub = XcmVersionedLocation.V5({
      parents: 1,
      interior: XcmV5Junctions.X1(XcmV5Junction.Parachain(1000)),
    });

    const dryRunResultOnPBH: any = await dryRunExecuteXcm(
      "PolkadotBridgeHub",
      polkadotBridgeHubApi,
      assetHubAsSeenByBridgeHub,
      remoteMessage as XcmVersionedXcm,
    );
    const executionResultOnPBH = dryRunResultOnPBH.value.execution_result;
    expect(dryRunResultOnPBH.success).toBe(true);
    expect(executionResultOnPBH.success).toBe(true);
    const dryRunEmittedEventsOnPBH: any[] =
      dryRunResultOnPBH.value.emitted_events;
    console.log(
      "Dry Run Emitted Events on PolkadotBridgeHub:",
      prettyString(dryRunEmittedEventsOnPBH),
    );
    const dryRunMessageAcceptedEventOnPBH = dryRunEmittedEventsOnPBH.find(
      (event) =>
        event.type === "BridgeKusamaMessages" &&
        event.value.type === "MessageAccepted",
    );
    expect(dryRunMessageAcceptedEventOnPBH).toBeDefined();

    const extrinsicOnPAH = await signAndSubmit(
      "PolkadotAssetHub",
      txOnPAH,
      aliceSigner,
    );
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
    console.log(prettyString(transferEvents));
    // expect(transferEvents.at(-1).payload.amount).toBe(100_000n);

    // const xcmpMessageSentEvents: any[] =
    //   await polkadotAssetHubApi.event.XcmpQueue.XcmpMessageSent.pull();
    // expect(xcmpMessageSentEvents.length).greaterThanOrEqual(1);

    // const sentEvents: any[] =
    //   await polkadotAssetHubApi.event.PolkadotXcm.Sent.pull();
    // expect(sentEvents.length).greaterThanOrEqual(1);
    // const sentEvent = sentEvents[sentEvents.length - 1].payload;
    // expect(sentEvent.destination).toEqual({
    //   parents: 2,
    //   interior: {
    //     type: "X2",
    //     value: [
    //       {
    //         type: "GlobalConsensus",
    //         value: {
    //           type: "Kusama",
    //           value: undefined,
    //         },
    //       },
    //       {
    //         type: "Parachain",
    //         value: 1000,
    //       },
    //     ],
    //   },
    // });

    // const polkadotAssetHubRpcClient = await createRpcClient(POLKADOT_AH);
    // const hrmpOutboundMessagesOnPAH = await checkHrmp({
    //   api: polkadotAssetHubRpcClient,
    // }).value();
    // expect(hrmpOutboundMessagesOnPAH).toBeDefined();
    // const outboundMessagesOnPAH: any[] =
    //   hrmpOutboundMessagesOnPAH[0].data[1].v5;
    // const topicId = outboundMessagesOnPAH.at(-1).setTopic;

    // const polkadotBridgeHubNextBlock = await waitForNextBlock(
    //   polkadotBridgeHubClient,
    //   polkadotBridgeHubCurrentBlock,
    // );
    // expect(polkadotBridgeHubNextBlock.number).toBeGreaterThan(
    //   polkadotBridgeHubCurrentBlock.number,
    // );

    // const messageAcceptedEvents: any[] =
    //   await polkadotBridgeHubApi.event.BridgeKusamaMessages.MessageAccepted.pull();
    // expect(messageAcceptedEvents.length).greaterThanOrEqual(1);

    // const processedEvents: any[] =
    //   await polkadotBridgeHubApi.event.MessageQueue.Processed.pull();
    // expect(processedEvents.length).greaterThanOrEqual(1);
    // const processedEvent = processedEvents[processedEvents.length - 1].payload;
    // expect(processedEvent.id.asHex()).toEqual(topicId);

    // const messageKey = messageAcceptedEvents.at(-1).payload;
    // const outboundMessagesOnPBH =
    //   await polkadotBridgeHubApi.query.BridgeKusamaMessages.OutboundMessages.getValue(
    //     messageKey,
    //   );
    // expect(outboundMessagesOnPBH).toBeDefined();

    // // `OutboundMessages` encodes `BridgeMessage { universal_dest, message }`.
    // // https://paritytech.github.io/polkadot-sdk/master/staging_xcm_builder/struct.BridgeMessage.html
    // const outboundMessagesAsBytesOnPBH = outboundMessagesOnPBH!.asBytes();

    // // https://github.com/AcalaNetwork/acala-types.js/blob/master/packages/types/src/interfaces/lookup.ts
    // const polkadotBridgeHubRpcClient = await createRpcClient(POLKADOT_BH);
    // // Decode `universal_dest` with the first part as `StagingXcmV5Junction`.
    // // Byte 0: https://paritytech.github.io/polkadot-sdk/master/staging_xcm/enum.VersionedInteriorLocation.html
    // // Byte 1: Ignore
    // // Byte 2: VersionedInteriorLocation::V5
    // expect(outboundMessagesAsBytesOnPBH[2]).toBe(5);
    // // Byte 3: Junctions::X2
    // expect(outboundMessagesAsBytesOnPBH[3]).toBe(2);
    // const universalDestX2_0 = polkadotBridgeHubRpcClient.createType(
    //   "StagingXcmV5Junction",
    //   outboundMessagesAsBytesOnPBH[3],
    // );
    // expect(universalDestX2_0.toJSON()).toEqual({
    //   accountIndex64: {
    //     network: null,
    //     index: 0,
    //   },
    // });
    // // Bytes 4: Junction::GlobalConsensus
    // // Bytes 5: NetworkId::Kusama
    // const universalDestX2_1 = polkadotBridgeHubRpcClient.createType(
    //   "StagingXcmV5Junction",
    //   outboundMessagesAsBytesOnPBH.slice(4, 6),
    // );
    // expect(universalDestX2_1.toJSON()).toEqual({
    //   globalConsensus: {
    //     kusama: null,
    //   },
    // });
    // // Bytes 6: Junction::Parachain
    // // Bytes 7-8: compact(1000) => ParaId 1000
    // const universalDestX2_2 = polkadotBridgeHubRpcClient.createType(
    //   "StagingXcmV5Junction",
    //   outboundMessagesAsBytesOnPBH.slice(6, 9),
    // );
    // expect(universalDestX2_2.toJSON()).toEqual({
    //   parachain: 1000,
    // });
    // // Decode `message` with the rest as `XcmVersionedXcm`.
    // // Byte 9+: https://paritytech.github.io/polkadot-sdk/master/staging_xcm/enum.VersionedXcm.html
    // // https://papi.how/typed-codecs/
    // const codecsOnPBH = await getTypedCodecs(PolkadotBridgeHub);
    // const bridgeMessageOnPBH =
    //   codecsOnPBH.apis.XcmPaymentApi.query_xcm_weight.args.dec(
    //     outboundMessagesAsBytesOnPBH.slice(9),
    //   );
    // expect(bridgeMessageOnPBH).toHaveLength(1);

    // const bridgeMessage = bridgeMessageOnPBH[0];
    // // Xcm([
    // //   UniversalOrigin(GlobalConsensus(Polkadot)),
    // //   DescendOrigin(X1([Parachain(1000)])),
    // //   ReserveAssetDeposited(Assets([Asset { id: AssetId(Location { parents: 2, interior: X1([GlobalConsensus(Polkadot)]) }), fun: Fungible(100000) }])),
    // //   ClearOrigin,
    // //   BuyExecution { fees: Asset { id: AssetId(Location { parents: 2, interior: X1([GlobalConsensus(Polkadot)]) }), fun: Fungible(100000) }, weight_limit: Unlimited },
    // //   DepositAsset { assets: Wild(AllCounted(1)), beneficiary: Location { parents: 0, interior: X1([AccountId32 { network: None, id: [152, 24, 255, 60, ...] }]) } },
    // //   SetTopic([36, 230, 219, 172, ...])
    // // ])
    // const metadataOnK: any = decAnyMetadata(
    //   (await kusamaAssetHubApi.apis.Metadata.metadata()).asBytes(),
    // ).metadata.value;
    // const palletsOnK: any = metadataOnK.pallets;
    // const toPolkadotRouter: any = palletsOnK.find(
    //   (p: any) => p.name == "ToPolkadotXcmRouter",
    // );
    // expect(toPolkadotRouter).toBeDefined();

    // const interior = XcmV5Junctions.X2([
    //   XcmV5Junction.GlobalConsensus(XcmV5NetworkId.Polkadot()),
    //   XcmV5Junction.Parachain(1000),
    // ]);

    // const instructions = bridgeMessage.value;

    // const descendOriginIdx = instructions.findIndex(
    //   (i) => i.type === "DescendOrigin",
    // );
    // expect(descendOriginIdx).toBe(1);
    // // instructions[descendOriginIdx] = XcmV5Instruction.DescendOrigin(
    // //   XcmV5Junctions.X1(XcmV5Junction.Parachain(1002)),
    // // );

    // const reserveAssetDepositedIdx = instructions.findIndex(
    //   (i) => i.type === "ReserveAssetDeposited",
    // );
    // expect(reserveAssetDepositedIdx).toBe(2);
    // const reserveAssetDeposited = instructions[
    //   reserveAssetDepositedIdx
    // ] as Extract<XcmV5Instruction, { type: "ReserveAssetDeposited" }>;
    // (reserveAssetDeposited.value[0] as any).id.interior = interior;

    // const clearOriginIdx = instructions.findIndex(
    //   (i) => i.type === "ClearOrigin",
    // );
    // expect(clearOriginIdx).toBe(3);

    // const buyExecutionIdx = instructions.findIndex(
    //   (i) => i.type === "BuyExecution",
    // );
    // expect(buyExecutionIdx).toBe(4);
    // const buyExecution = instructions[buyExecutionIdx] as Extract<
    //   XcmV5Instruction,
    //   { type: "BuyExecution" }
    // >;
    // buyExecution.value.fees.id.interior = interior;

    // const depositAssetIdx = instructions.findIndex(
    //   (i) => i.type === "DepositAsset",
    // );
    // expect(depositAssetIdx).toBe(5);

    // const setTopicIdx = instructions.findIndex((i) => i.type === "SetTopic");
    // expect(setTopicIdx).toBe(6);

    // bridgeMessage.value = instructions.slice(reserveAssetDepositedIdx);

    // const weightForBM: any =
    //   await kusamaAssetHubApi.apis.XcmPaymentApi.query_xcm_weight(
    //     bridgeMessage,
    //   );
    // if (!weightForBM.success) {
    //   console.error(
    //     "Failed to query XCM weight on Kusama Asset/Bridge Hub:",
    //     prettyString(weightForBM),
    //   );
    // }
    // // console.log(prettyString(weightForBM));
    // expect(weightForBM.success).toBe(true);
    // // buyExecution.value.weight_limit = {
    // //   type: "Limited",
    // //   value: weightForBM.value,
    // // };

    // // console.log(prettyString(bridgeMessage));

    // const dryRunResultOnKAH = await dryRunExecuteXcm(
    //   "KusamaAssetHub",
    //   kusamaAssetHubApi,
    //   XcmVersionedLocation.V5({
    //     parents: 2,
    //     interior,
    //   }),
    //   bridgeMessage,
    // );
    // // console.log(prettyString(dryRunResultOnKAH));

    // // const txForBM: Transaction<any, string, string, any> =
    // //   kusamaAssetHubApi.tx.PolkadotXcm.execute({
    // //     message: bridgeMessage,
    // //     max_weight: weightForBM.value,
    // //   });
    // // const extrinsicForBM = await signAndSubmit(
    // //   "Kusama Asset/Bridge Hub",
    // //   txForBM,
    // //   aliceSigner,
    // // );
    // // console.log(prettyString(extrinsicForBM));
    // // expect(extrinsicForBM.ok).toBe(true);
    // // XCM execution failed at instruction index=1 error=UntrustedReserveLocation

    // // const kusamaBridgeHubNextBlock = await waitForNextBlock(
    // //   kusamaBridgeHubClient,
    // //   kusamaBridgeHubCurrentBlock,
    // // );
    // // console.log(prettyString(kusamaBridgeHubNextBlock));
    // // expect(kusamaBridgeHubNextBlock.number).toBeGreaterThan(
    // //   kusamaBridgeHubCurrentBlock.number,
    // // );
  });
});
