import {
  createClient,
  Enum,
  type BlockInfo,
  type PolkadotClient,
  type PolkadotSigner,
  type Transaction,
  type TxFinalizedPayload,
} from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider";
import { withPolkadotSdkCompat } from "polkadot-api/polkadot-sdk-compat";
import { ApiPromise, WsProvider } from "@polkadot/api";
import {
  XcmVersionedLocation,
  XcmVersionedXcm,
} from "@polkadot-api/descriptors";
import type { ProviderInterface } from "@polkadot/rpc-provider/types";
import { sr25519CreateDerive } from "@polkadot-labs/hdkd";
import {
  DEV_PHRASE,
  entropyToMiniSecret,
  mnemonicToEntropy,
  type KeyPair,
} from "@polkadot-labs/hdkd-helpers";

const XCM_VERSION = 5;
const MAX_RETRIES = 8; // Number of attempts to wait for block finalisation

export function createApiClient(endpoint: string): PolkadotClient {
  return createClient(withPolkadotSdkCompat(getWsProvider(endpoint)));
}

export async function createRpcClient(endpoint: string): Promise<ApiPromise> {
  const provider = new WsProvider(endpoint) as ProviderInterface;
  const rpcClient: any = await ApiPromise.create({
    provider: provider,
  });
  await rpcClient.isReady;

  return rpcClient;
}

export function deriveAlice(): KeyPair {
  const entropy = mnemonicToEntropy(DEV_PHRASE);
  const miniSecret = entropyToMiniSecret(entropy);
  const derive = sr25519CreateDerive(miniSecret);
  return derive("//Alice");
}

export async function dryRunExecuteXcm(
  chainName: string,
  typedApi: any,
  originLocation: XcmVersionedLocation,
  xcm: XcmVersionedXcm,
): Promise<any> {
  return handleDryRunResult(
    "dry_run_xcm",
    chainName,
    xcm,
    await typedApi.apis.DryRunApi.dry_run_xcm(originLocation, xcm),
  );
}

export async function dryRunXcmExtrinsic(
  chainName: string,
  typedApi: any,
  origin: Enum<any>,
  decodedCall: any,
): Promise<any> {
  return handleDryRunResult(
    "dry_run_call",
    chainName,
    decodedCall,
    await typedApi.apis.DryRunApi.dry_run_call(
      origin,
      decodedCall,
      XCM_VERSION,
    ),
  );
}

export function prettyString(value: any): string {
  return JSON.stringify(value, toHuman, 2);
}

export async function signAndSubmit(
  chainName: string,
  tx: Transaction<any, string, string, any>,
  signer: PolkadotSigner,
): Promise<TxFinalizedPayload> {
  const extrinsic = await tx.signAndSubmit(signer);
  if (!extrinsic.ok) {
    const dispatchError = extrinsic.dispatchError;
    if (dispatchError.type === "Module") {
      const modErr: any = dispatchError.value;
      const localErr: any = modErr.value;
      const innerErr: any = localErr?.value?.error?.type;
      console.error(
        `Dispatch Error in Module on ${chainName}: ${modErr.type} → ${localErr?.type} (${innerErr})`,
      );
    } else {
      console.error(
        "Dispatch Error on",
        chainName,
        prettyString(dispatchError),
      );
    }
  }
  return extrinsic;
}

export const toHuman = (_key: any, value: any) => {
  if (typeof value === "bigint") {
    return Number(value);
  }

  if (value && typeof value === "object" && typeof value.asHex === "function") {
    return value.asHex();
  }

  return value;
};

export async function waitForNextBlock(
  client: PolkadotClient,
  currentBlock: BlockInfo,
): Promise<BlockInfo> {
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

function handleDryRunResult(
  mode: string,
  chainName: string,
  xcmOrExtrinsic: any,
  dryRunResult: any,
): any {
  const executionResult = dryRunResult.value.execution_result;
  const executionSuccess =
    executionResult?.success == true || executionResult?.type === "Complete";
  if (dryRunResult.success == true && executionSuccess == true) {
    dryRunResult.value.execution_result.success = true;
  } else {
    console.log(
      `Dry Run XCM (${mode}) on ${chainName}: ${prettyString(xcmOrExtrinsic)}`,
    );
    console.log(
      `Dry Run Result (${mode}) on ${chainName}: ${prettyString(dryRunResult.value)}`,
    );
    dryRunResult.value.execution_result.success = false;
  }
  return dryRunResult;
}
