// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Quorum} from "./Quorum.sol";

/// @title QuorumFactory
/// @notice Deploys Quorum multisig wallet contracts on BOT Chain.
///
/// @dev What this contract cannot do:
/// - No administrative controls, pause functions, or fee extraction.
/// - Cannot alter or recover wallets after creation.
contract QuorumFactory {
  /// @notice Emitted when a new Quorum multisig wallet is deployed.
  /// @param wallet Address of the deployed Quorum instance.
  /// @param owners Initial wallet owners.
  /// @param threshold Number of confirmations required to execute a transaction.
  event WalletCreated(address indexed wallet, address[] owners, uint256 threshold);

  /// @notice Creates a new Quorum multisig wallet.
  /// @param owners Initial owner addresses.
  /// @param threshold Confirmation threshold.
  /// @return wallet The address of the deployed Quorum contract.
  function create(address[] calldata owners, uint256 threshold) external returns (address wallet) {
    Quorum q = new Quorum(owners, threshold);
    wallet = address(q);
    emit WalletCreated(wallet, owners, threshold);
  }
}
