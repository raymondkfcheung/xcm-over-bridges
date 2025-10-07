import { sr25519CreateDerive } from "@polkadot-labs/hdkd";
import {
  DEV_PHRASE,
  entropyToMiniSecret,
  mnemonicToEntropy,
  type KeyPair,
} from "@polkadot-labs/hdkd-helpers";

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
