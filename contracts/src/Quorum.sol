// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

/// @title Quorum
/// @notice A minimal multisig wallet on BOT Chain.
///
/// @dev What this contract cannot do:
/// - Configuration is permanent: owners and threshold are immutable after deployment.
/// - No owner addition, removal, or replacement.
/// - No threshold modification.
/// - No pause, no upgradeability, no proxy delegate calls.
/// - No emergency recovery hatch.
/// - Funds can only leave through an executed transaction confirmed by at least `threshold` owners.
///   If keys are lost such that `threshold` owners cannot sign, remaining funds are permanently locked.
contract Quorum {
  struct Transaction {
    address to;
    uint256 value;
    bytes data;
    bool executed;
    uint256 confirmations;
  }

  uint256 public constant MAX_OWNERS = 20;

  address[] private _owners;
  mapping(address => bool) public isOwner;
  uint256 public threshold;

  mapping(uint256 txId => Transaction) private _transactions;
  mapping(uint256 txId => mapping(address => bool)) public confirmedBy;
  uint256 private _txCount;

  event Deposit(address indexed from, uint256 amount);
  event Submitted(uint256 indexed txId, address indexed submitter, address indexed to, uint256 value);
  event Confirmed(uint256 indexed txId, address indexed owner);
  event Revoked(uint256 indexed txId, address indexed owner);
  event Executed(uint256 indexed txId);

  error NotOwner();
  error AlreadyConfirmed(uint256 txId);
  error NotConfirmed(uint256 txId);
  error AlreadyExecuted(uint256 txId);
  error ThresholdNotMet(uint256 txId, uint256 required, uint256 actual);
  error ExecutionFailed(uint256 txId);
  error TxNotFound(uint256 txId);

  error NoOwners();
  error TooManyOwners(uint256 count, uint256 max);
  error ThresholdZero();
  error ThresholdTooHigh(uint256 threshold, uint256 ownerCount);
  error ZeroOwner(uint256 index);
  error DuplicateOwner(address owner);

  modifier onlyOwner() {
    if (!isOwner[msg.sender]) revert NotOwner();
    _;
  }

  /// @notice Creates a new Quorum multisig wallet.
  /// @param owners_ List of initial owner addresses (1 to 20, non-zero, unique).
  /// @param threshold_ Number of confirmations required to execute a transaction (1 to owners.length).
  constructor(address[] memory owners_, uint256 threshold_) {
    uint256 count = owners_.length;
    if (count == 0) revert NoOwners();
    if (count > MAX_OWNERS) revert TooManyOwners(count, MAX_OWNERS);
    if (threshold_ == 0) revert ThresholdZero();
    if (threshold_ > count) revert ThresholdTooHigh(threshold_, count);

    for (uint256 i = 0; i < count; i++) {
      address owner = owners_[i];
      if (owner == address(0)) revert ZeroOwner(i);
      if (isOwner[owner]) revert DuplicateOwner(owner);

      isOwner[owner] = true;
      _owners.push(owner);
    }

    threshold = threshold_;
  }

  /// @notice Accepts native BOT deposits.
  receive() external payable {
    emit Deposit(msg.sender, msg.value);
  }

  /// @notice Submits a new transaction proposal for owner confirmation.
  /// @dev Does not auto-confirm for the submitter.
  /// @param to Destination address.
  /// @param value Amount of BOT to forward in wei.
  /// @param data Optional calldata payload.
  /// @return txId The index of the submitted transaction.
  function submit(address to, uint256 value, bytes calldata data) external onlyOwner returns (uint256 txId) {
    txId = _txCount++;
    _transactions[txId] = Transaction({
      to: to,
      value: value,
      data: data,
      executed: false,
      confirmations: 0
    });

    emit Submitted(txId, msg.sender, to, value);
  }

  /// @notice Confirms a submitted transaction.
  /// @param txId Transaction index.
  function confirm(uint256 txId) external onlyOwner {
    if (txId >= _txCount) revert TxNotFound(txId);
    Transaction storage txn = _transactions[txId];
    if (txn.executed) revert AlreadyExecuted(txId);
    if (confirmedBy[txId][msg.sender]) revert AlreadyConfirmed(txId);

    confirmedBy[txId][msg.sender] = true;
    txn.confirmations += 1;

    emit Confirmed(txId, msg.sender);
  }

  /// @notice Revokes a previous confirmation before execution.
  /// @param txId Transaction index.
  function revoke(uint256 txId) external onlyOwner {
    if (txId >= _txCount) revert TxNotFound(txId);
    Transaction storage txn = _transactions[txId];
    if (txn.executed) revert AlreadyExecuted(txId);
    if (!confirmedBy[txId][msg.sender]) revert NotConfirmed(txId);

    confirmedBy[txId][msg.sender] = false;
    txn.confirmations -= 1;

    emit Revoked(txId, msg.sender);
  }

  /// @notice Executes a transaction once confirmation count meets or exceeds threshold.
  /// @param txId Transaction index.
  function execute(uint256 txId) external onlyOwner {
    if (txId >= _txCount) revert TxNotFound(txId);
    Transaction storage txn = _transactions[txId];
    if (txn.executed) revert AlreadyExecuted(txId);
    if (txn.confirmations < threshold) revert ThresholdNotMet(txId, threshold, txn.confirmations);

    txn.executed = true;

    (bool ok, ) = txn.to.call{value: txn.value}(txn.data);
    if (!ok) revert ExecutionFailed(txId);

    emit Executed(txId);
  }

  /// @notice Returns full transaction details for `txId`.
  /// @param txId Transaction index.
  function transactions(uint256 txId) external view returns (Transaction memory) {
    if (txId >= _txCount) revert TxNotFound(txId);
    return _transactions[txId];
  }

  /// @notice Returns total number of proposed transactions.
  function txCount() external view returns (uint256) {
    return _txCount;
  }

  /// @notice Returns all wallet owner addresses.
  function owners() external view returns (address[] memory) {
    return _owners;
  }

  /// @notice Returns total number of wallet owners.
  function ownerCount() external view returns (uint256) {
    return _owners.length;
  }
}
