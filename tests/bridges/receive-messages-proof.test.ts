import { withExpect } from "@acala-network/chopsticks-testing";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getTypedCodecs,
  Binary,
  Enum,
  type BlockInfo,
  type FixedSizeBinary,
  type PolkadotClient,
  type SS58String,
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
import { ss58Address, ss58Encode } from "@polkadot-labs/hdkd-helpers";
import {
  createApiClient,
  createRpcClient,
  deriveAlice,
  dryRunExecuteXcm,
  dryRunXcmExtrinsic,
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

describe("Receive Message Proof Tests", () => {
  it("dry-run existing call", async () => {
    const alice = deriveAlice();
    const alicePublicKey = alice.publicKey;
    const aliceSigner = getPolkadotSigner(
      alicePublicKey,
      "Sr25519",
      alice.sign,
    );
    const aliceAddress = ss58Address(alicePublicKey);

    const relayer_id_at_bridged_chain: SS58String = ss58Encode(
      "0x1629f45fd0f1bdbfcd46142c8519e4da2967832e025b30232bddc8bba699ec7a",
      0,
    );
    const bridged_header_hash: FixedSizeBinary<32> = Binary.fromHex(
      "0xb54d4d5067a839273137f94fe63aa17cd4430a3a9498f87fdf19c3e80481bcea",
    );
    const storage_proof: Binary[] = [
      Binary.fromHex(
        "0x3f18028dd579acba34179f4cf7a047779caa00000001af05000000000000fae19719c4655ed9b38c35228dd6a8266b07243727772153f9ddbd2e39a24870",
      ),
      Binary.fromHex(
        "0x3f18048061994a6181f56da66d49105f9af500000001ae05000000000000b6afaa34a3329f8358a9b74716c16e5008a690d6f4060df9d8e435c918fcceac",
      ),
      Binary.fromHex(
        "0x7f0806c246acb9b55077390e3ca723a0ca1fd6bfa4fbbbb302d0f4e13a89046731810000000164ae05000000000000ad05000000000000af0500000000000000",
      ),
      Binary.fromHex(
        "0x801160807451573d33cc8f1c15ed496eb26ff38e10514966f238fa2a822639d8d1e9b0cd80d800ca5973a6269cc11c0dcdf9b744bb45896b5ff3d0a60e3f32082b89623174801f9163c0386bb0705b63d21324a6dd20bdb97ab3fb452f53b96bcc077d6dc71a80790de4055cadea96284cd8306c89934140b1bd6eb21a7fbadeaa0b0209321071",
      ),
      Binary.fromHex(
        "0x80bffd8028fda79bec8093ae493d2452ae12ad660f686a0732b1c8ab1fcd13ed84f5656380a549b6d027e7f8ffa19b916a26aadc02c89fc2975f39071f31616c17724834d280e1119fb2ff77415218bde13551df9c1deb5f7fbc409502606785a74d68f2220a802a3139b16429f55ee208db7509bcb296a75d0b849c5a30b62a37a736433a5d378062bc3b038eb1a3835841146e2c2d26f6d0b5eda85fd7cee46ec547f10a3b0429800856bfa10bcf2f5c57a0ff05ff54b93bc5bedb62530c11e1ece72dd1687e0ea2806773b287c7af4f3a7320f50fad9c0d4b1a79fe9338fb0823506126085e7dae9980e9a5050bcce12394f8ac7c549193c6969824ab6177de3d55dcd6ee2e3920be6180015a3dcdaafc29eae8fc47d56657fcb60c19e9c24b1ab51ffc9a7e7583a8bb4e8032aa779d5b8ccf9b9dcde967998c8f661b03c6a5b2c9cfd40af6ac419c09b999803b616a6c0ae357763b1d61ba92e0b61ebc57f5465d3487ab2f2561ae6943116f80e8cafbef50a072daa5de180d2be3869dcb1187f5fb62e391aa55d235ef772c3880c8ef11d50653d12d53fb1da7df500d788b7a02a877ed1aa1a065d0dafc41c8ac80ebb79dc6db1cc2561e98b2951219fb4295261999f41ed23ce824a8cca52ff6e2",
      ),
      Binary.fromHex(
        "0x9e499b8502d976c920e399c80697ef001043505f0e7b9012096b41c4eb3aaf947f6ea4290801008012120b5470a12664596c242301f460e75af2e80fab34724cf589733ccdd3034480fe7d72734df1625927a32727b3592d0b8f3f279f9f936c11d5bea5f5868ed99e8051386895d1dc2a7244dc4e1596211bf5ff31152268357cef2c6e116cd847fc77",
      ),
      Binary.fromHex(
        "0x9f0a395e6242c6813b196ca31ed0547ea7010880832658ba8823b43e05e5b9f4ff1843b0ab9dfe55952e09b2b404068c64cca27b80ecdaae5d22c74e43592412281253edae037e726d2eef2093f8d09f86672e3dc8",
      ),
      Binary.fromHex(
        "0xd501cd010502090300a10f051c2509020b0100a10f00040100000b5f96413187040a130100000b5f9641318704000d01020400010100a008c5e2dcf1d1d2141eed6102cab15b40650aae7ddb4de7bf3edf788b69166d2c8854129002e4d77156b85a58a48a57042ab08c27ef06cc172258e073d0025b40",
      ),
      Binary.fromHex(
        "0xdd01d5010502090300a10f051c2509020b0100a10f00040100000fd4b19a946e20010a130100000fd4b19a946e2001000d010204000101007279fcf9694718e1234d102825dccaf332f0ea36edf1ca7c0358c4b68260d24b2c02b848eb2f7a15e277b078d332ed61123868629812f1abe727b38472632a567e",
      ),
    ];
    const lane: FixedSizeBinary<4> = Binary.fromHex("0x00000001");
    const nonces_start = 1454n;
    const nonces_end = nonces_start;
    const proof = {
      bridged_header_hash,
      storage_proof,
      lane,
      nonces_start,
      nonces_end,
    };
    const messages_count = 2;
    const dispatch_weight = {
      ref_time: 587134532n,
      proof_size: 0n,
    };
    const tx: Transaction<any, string, string, any> =
      kusamaBridgeHubApi.tx.BridgePolkadotMessages.receive_messages_proof({
        relayer_id_at_bridged_chain,
        proof,
        messages_count,
        dispatch_weight,
      });
    const origin = Enum("system", Enum("Signed", aliceAddress));
    const dryRunResult: any = await dryRunXcmExtrinsic(
      "KusamaBridgeHub",
      kusamaBridgeHubApi,
      origin,
      tx.decodedCall,
    );
    console.log(`Dry Run Result: ${prettyString(dryRunResult)}`);
  });
});
