/**
 * QuorumFactory and Quorum ABIs.
 *
 * Hand-written and `as const` rather than imported from `contracts/out`. The const assertion is
 * what gives viem and wagmi their argument and return types; a generated JSON artifact loses that
 * unless it is cast, and a mistyped argument would then only surface as a revert.
 *
 * Custom errors are included so viem can decode reverts and explain why an action failed.
 */

export const quorumFactoryAbi = [
  {
    type: "function",
    name: "create",
    stateMutability: "nonpayable",
    inputs: [
      { name: "owners", type: "address[]" },
      { name: "threshold", type: "uint256" },
    ],
    outputs: [{ name: "wallet", type: "address" }],
  },
  {
    type: "event",
    name: "WalletCreated",
    inputs: [
      { name: "wallet", type: "address", indexed: true },
      { name: "owners", type: "address[]", indexed: false },
      { name: "threshold", type: "uint256", indexed: false },
    ],
  },
  { type: "error", name: "NoOwners", inputs: [] },
  {
    type: "error",
    name: "TooManyOwners",
    inputs: [
      { name: "count", type: "uint256" },
      { name: "max", type: "uint256" },
    ],
  },
  { type: "error", name: "ThresholdZero", inputs: [] },
  {
    type: "error",
    name: "ThresholdTooHigh",
    inputs: [
      { name: "threshold", type: "uint256" },
      { name: "ownerCount", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "ZeroOwner",
    inputs: [{ name: "index", type: "uint256" }],
  },
  {
    type: "error",
    name: "DuplicateOwner",
    inputs: [{ name: "owner", type: "address" }],
  },
] as const;

export const quorumAbi = [
  {
    type: "receive",
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "submit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "data", type: "bytes" },
    ],
    outputs: [{ name: "txId", type: "uint256" }],
  },
  {
    type: "function",
    name: "confirm",
    stateMutability: "nonpayable",
    inputs: [{ name: "txId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "revoke",
    stateMutability: "nonpayable",
    inputs: [{ name: "txId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "execute",
    stateMutability: "nonpayable",
    inputs: [{ name: "txId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "transactions",
    stateMutability: "view",
    inputs: [{ name: "txId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "data", type: "bytes" },
          { name: "executed", type: "bool" },
          { name: "confirmations", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "_transactions",
    stateMutability: "view",
    inputs: [{ name: "txId", type: "uint256" }],
    outputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "data", type: "bytes" },
      { name: "executed", type: "bool" },
      { name: "confirmations", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "txCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "isOwner",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "owners",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address[]" }],
  },
  {
    type: "function",
    name: "ownerCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "threshold",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "confirmedBy",
    stateMutability: "view",
    inputs: [
      { name: "txId", type: "uint256" },
      { name: "owner", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "MAX_OWNERS",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "event",
    name: "Deposit",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Submitted",
    inputs: [
      { name: "txId", type: "uint256", indexed: true },
      { name: "submitter", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Confirmed",
    inputs: [
      { name: "txId", type: "uint256", indexed: true },
      { name: "owner", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "Revoked",
    inputs: [
      { name: "txId", type: "uint256", indexed: true },
      { name: "owner", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "Executed",
    inputs: [{ name: "txId", type: "uint256", indexed: true }],
  },
  { type: "error", name: "NotOwner", inputs: [] },
  {
    type: "error",
    name: "AlreadyConfirmed",
    inputs: [{ name: "txId", type: "uint256" }],
  },
  {
    type: "error",
    name: "NotConfirmed",
    inputs: [{ name: "txId", type: "uint256" }],
  },
  {
    type: "error",
    name: "AlreadyExecuted",
    inputs: [{ name: "txId", type: "uint256" }],
  },
  {
    type: "error",
    name: "ThresholdNotMet",
    inputs: [
      { name: "txId", type: "uint256" },
      { name: "required", type: "uint256" },
      { name: "actual", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "ExecutionFailed",
    inputs: [{ name: "txId", type: "uint256" }],
  },
  {
    type: "error",
    name: "TxNotFound",
    inputs: [{ name: "txId", type: "uint256" }],
  },
  { type: "error", name: "NoOwners", inputs: [] },
  {
    type: "error",
    name: "TooManyOwners",
    inputs: [
      { name: "count", type: "uint256" },
      { name: "max", type: "uint256" },
    ],
  },
  { type: "error", name: "ThresholdZero", inputs: [] },
  {
    type: "error",
    name: "ThresholdTooHigh",
    inputs: [
      { name: "threshold", type: "uint256" },
      { name: "ownerCount", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "ZeroOwner",
    inputs: [{ name: "index", type: "uint256" }],
  },
  {
    type: "error",
    name: "DuplicateOwner",
    inputs: [{ name: "owner", type: "address" }],
  },
] as const;
