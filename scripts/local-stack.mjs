import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createPublicClient, createWalletClient, defineChain, http, parseEventLogs } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const PORT = 8547;
const RPC = `http://127.0.0.1:${PORT}`;
const CHAIN_ID = 968;
const KEY1 = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const KEY2 = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const KEY3 = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";

const local = defineChain({
  id: CHAIN_ID,
  name: "anvil",
  nativeCurrency: { name: "Test BOT", symbol: "tBOT", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

spawn("anvil", ["--port", String(PORT), "--chain-id", String(CHAIN_ID), "--silent"], {
  detached: true,
  stdio: "ignore",
}).unref();

const account1 = privateKeyToAccount(KEY1);
const account2 = privateKeyToAccount(KEY2);
const account3 = privateKeyToAccount(KEY3);

const pub = createPublicClient({ chain: local, transport: http() });
const wallet = createWalletClient({ account: account1, chain: local, transport: http() });

for (let i = 0; ; i++) {
  try {
    await pub.getBlockNumber();
    break;
  } catch {
    if (i > 100) throw new Error(`anvil never answered on ${RPC}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

const artifact = JSON.parse(
  readFileSync(new URL("../contracts/out/QuorumFactory.sol/QuorumFactory.json", import.meta.url), "utf8"),
);

await wallet.sendTransaction({ to: account1.address, value: 0n });
await wallet.sendTransaction({ to: account1.address, value: 0n });

const deployHash = await wallet.deployContract({
  abi: artifact.abi,
  bytecode: artifact.bytecode.object,
});
const deployed = await pub.waitForTransactionReceipt({ hash: deployHash });
const factoryAddress = deployed.contractAddress;

const createHash = await wallet.writeContract({
  address: factoryAddress,
  abi: artifact.abi,
  functionName: "create",
  args: [[account1.address, account2.address, account3.address], 2n],
});
const receipt = await pub.waitForTransactionReceipt({ hash: createHash });
const logs = parseEventLogs({ abi: artifact.abi, eventName: "WalletCreated", logs: receipt.logs });
const walletAddress = logs[0].args.wallet;

writeFileSync(
  new URL("../.env.local", import.meta.url),
  [
    "# Written by scripts/local-stack.mjs. Not the testnet or mainnet config.",
    "NEXT_PUBLIC_BOTCHAIN_NETWORK=testnet",
    `NEXT_PUBLIC_BOHR_RPC=${RPC}`,
    `NEXT_PUBLIC_CONTRACT_968=${factoryAddress}`,
    `NEXT_PUBLIC_DEPLOY_BLOCK_968=${deployed.blockNumber - 1n}`,
    "",
  ].join("\n"),
);

console.log(`chain       anvil ${CHAIN_ID} on ${RPC}`);
console.log(`factory     ${factoryAddress}  (block ${deployed.blockNumber})`);
console.log(`wallet #1   ${walletAddress} (2-of-3 multisig)`);
console.log("\n.env.local written. Start the app with: npm run dev");
