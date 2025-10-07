import {
  createClient,
  type BlockInfo,
  type PolkadotClient,
} from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider";
import { withPolkadotSdkCompat } from "polkadot-api/polkadot-sdk-compat";
import { ApiPromise, WsProvider } from "@polkadot/api";
import type { ProviderInterface } from "@polkadot/rpc-provider/types";
import { sr25519CreateDerive } from "@polkadot-labs/hdkd";
import {
  DEV_PHRASE,
  entropyToMiniSecret,
  mnemonicToEntropy,
  type KeyPair,
} from "@polkadot-labs/hdkd-helpers";

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
