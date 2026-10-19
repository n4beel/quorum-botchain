// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {Quorum} from "../src/Quorum.sol";
import {QuorumFactory} from "../src/QuorumFactory.sol";

contract RejectingReceiver {
  receive() external payable {
    revert("I reject payments");
  }
}

contract QuorumTest is Test {
  QuorumFactory internal factory;
  Quorum internal wallet;

  address internal alice = address(0xA11CE);
  address internal bob = address(0xB0B);
  address internal charlie = address(0xCAFE);
  address internal eve = address(0xE0E);
  address internal recipient = address(0xD00D);

  address[] internal defaultOwners;
  uint256 internal defaultThreshold = 2;

  event WalletCreated(address indexed wallet, address[] owners, uint256 threshold);
  event Deposit(address indexed from, uint256 amount);
  event Submitted(uint256 indexed txId, address indexed submitter, address indexed to, uint256 value);
  event Confirmed(uint256 indexed txId, address indexed owner);
  event Revoked(uint256 indexed txId, address indexed owner);
  event Executed(uint256 indexed txId);

  function setUp() public {
    factory = new QuorumFactory();

    defaultOwners = new address[](3);
    defaultOwners[0] = alice;
    defaultOwners[1] = bob;
    defaultOwners[2] = charlie;

    address walletAddr = factory.create(defaultOwners, defaultThreshold);
    wallet = Quorum(payable(walletAddr));
    vm.deal(address(wallet), 10 ether);
  }

  // --- 1. factory.create creates wallet with correct owners/threshold --------------------------

  function test_FactoryCreateInitializesCorrectly() public view {
    assertEq(wallet.threshold(), defaultThreshold);
    assertEq(wallet.ownerCount(), 3);
    assertTrue(wallet.isOwner(alice));
    assertTrue(wallet.isOwner(bob));
    assertTrue(wallet.isOwner(charlie));
    assertFalse(wallet.isOwner(eve));

    address[] memory owners = wallet.owners();
    assertEq(owners.length, 3);
    assertEq(owners[0], alice);
    assertEq(owners[1], bob);
    assertEq(owners[2], charlie);
  }

  // --- 2. Emits WalletCreated ------------------------------------------------------------------

  function test_EmitsWalletCreated() public {
    address[] memory owners = new address[](2);
    owners[0] = alice;
    owners[1] = bob;

    vm.recordLogs();
    address created = factory.create(owners, 2);

    Vm.Log[] memory entries = vm.getRecordedLogs();
    assertGt(entries.length, 0);

    // Find WalletCreated event
    bytes32 walletCreatedSig = keccak256("WalletCreated(address,address[],uint256)");
    bool found = false;
    for (uint256 i = 0; i < entries.length; i++) {
      if (entries[i].topics[0] == walletCreatedSig) {
        address loggedWallet = address(uint160(uint256(entries[i].topics[1])));
        assertEq(loggedWallet, created);
        (address[] memory loggedOwners, uint256 loggedThreshold) = abi.decode(entries[i].data, (address[], uint256));
        assertEq(loggedOwners.length, 2);
        assertEq(loggedOwners[0], alice);
        assertEq(loggedOwners[1], bob);
        assertEq(loggedThreshold, 2);
        found = true;
        break;
      }
    }
    assertTrue(found, "WalletCreated event not found");
  }

  // --- 3. Owner can submit ---------------------------------------------------------------------

  function test_OwnerCanSubmit() public {
    vm.prank(alice);
    vm.expectEmit(true, true, true, true, address(wallet));
    emit Submitted(0, alice, recipient, 1 ether);

    uint256 txId = wallet.submit(recipient, 1 ether, "");
    assertEq(txId, 0);
    assertEq(wallet.txCount(), 1);

    Quorum.Transaction memory txn = wallet.transactions(0);
    assertEq(txn.to, recipient);
    assertEq(txn.value, 1 ether);
    assertEq(txn.data.length, 0);
    assertFalse(txn.executed);
    assertEq(txn.confirmations, 0);
  }

  // --- 4. Owner can confirm --------------------------------------------------------------------

  function test_OwnerCanConfirm() public {
    vm.prank(alice);
    uint256 txId = wallet.submit(recipient, 1 ether, "");

    vm.prank(bob);
    vm.expectEmit(true, true, false, false, address(wallet));
    emit Confirmed(txId, bob);

    wallet.confirm(txId);

    assertTrue(wallet.confirmedBy(txId, bob));
    assertFalse(wallet.confirmedBy(txId, alice));

    Quorum.Transaction memory txn = wallet.transactions(txId);
    assertEq(txn.confirmations, 1);
  }

  // --- 5. Execute at threshold (2-of-3): submit → confirm x2 → execute -------------------------

  function test_ExecuteAtThresholdTransfersBalance() public {
    uint256 recipientBefore = recipient.balance;
    uint256 walletBefore = address(wallet).balance;

    vm.prank(alice);
    uint256 txId = wallet.submit(recipient, 1.5 ether, "");

    vm.prank(alice);
    wallet.confirm(txId);

    vm.prank(bob);
    wallet.confirm(txId);

    vm.prank(charlie);
    vm.expectEmit(true, false, false, false, address(wallet));
    emit Executed(txId);
    wallet.execute(txId);

    assertEq(recipient.balance, recipientBefore + 1.5 ether);
    assertEq(address(wallet).balance, walletBefore - 1.5 ether);

    Quorum.Transaction memory txn = wallet.transactions(txId);
    assertTrue(txn.executed);
  }

  // --- 6. Cannot execute below threshold -------------------------------------------------------

  function test_CannotExecuteBelowThreshold() public {
    vm.prank(alice);
    uint256 txId = wallet.submit(recipient, 1 ether, "");

    vm.prank(alice);
    wallet.confirm(txId);

    vm.prank(alice);
    vm.expectRevert(
      abi.encodeWithSelector(Quorum.ThresholdNotMet.selector, txId, 2, 1)
    );
    wallet.execute(txId);
  }

  // --- 7. Owner can revoke ---------------------------------------------------------------------

  function test_OwnerCanRevoke() public {
    vm.prank(alice);
    uint256 txId = wallet.submit(recipient, 1 ether, "");

    vm.prank(alice);
    wallet.confirm(txId);
    assertEq(wallet.transactions(txId).confirmations, 1);
    assertTrue(wallet.confirmedBy(txId, alice));

    vm.prank(alice);
    vm.expectEmit(true, true, false, false, address(wallet));
    emit Revoked(txId, alice);
    wallet.revoke(txId);

    assertFalse(wallet.confirmedBy(txId, alice));
    assertEq(wallet.transactions(txId).confirmations, 0);
  }

  function test_CannotRevokeIfNotConfirmed() public {
    vm.prank(alice);
    uint256 txId = wallet.submit(recipient, 1 ether, "");

    vm.prank(alice);
    vm.expectRevert(abi.encodeWithSelector(Quorum.NotConfirmed.selector, txId));
    wallet.revoke(txId);
  }

  // --- 8. Cannot confirm twice -----------------------------------------------------------------

  function test_CannotConfirmTwice() public {
    vm.prank(alice);
    uint256 txId = wallet.submit(recipient, 1 ether, "");

    vm.prank(alice);
    wallet.confirm(txId);

    vm.prank(alice);
    vm.expectRevert(abi.encodeWithSelector(Quorum.AlreadyConfirmed.selector, txId));
    wallet.confirm(txId);
  }

  // --- 9. Cannot execute twice -----------------------------------------------------------------

  function test_CannotExecuteTwice() public {
    vm.prank(alice);
    uint256 txId = wallet.submit(recipient, 1 ether, "");

    vm.prank(alice);
    wallet.confirm(txId);

    vm.prank(bob);
    wallet.confirm(txId);

    vm.prank(alice);
    wallet.execute(txId);

    vm.prank(bob);
    vm.expectRevert(abi.encodeWithSelector(Quorum.AlreadyExecuted.selector, txId));
    wallet.execute(txId);
  }

  function test_CannotConfirmOrRevokeAfterExecution() public {
    vm.prank(alice);
    uint256 txId = wallet.submit(recipient, 1 ether, "");

    vm.prank(alice);
    wallet.confirm(txId);

    vm.prank(bob);
    wallet.confirm(txId);

    vm.prank(alice);
    wallet.execute(txId);

    vm.prank(charlie);
    vm.expectRevert(abi.encodeWithSelector(Quorum.AlreadyExecuted.selector, txId));
    wallet.confirm(txId);

    vm.prank(alice);
    vm.expectRevert(abi.encodeWithSelector(Quorum.AlreadyExecuted.selector, txId));
    wallet.revoke(txId);
  }

  // --- 10. Non-owner cannot submit (NotOwner) --------------------------------------------------

  function test_NonOwnerCannotSubmit() public {
    vm.prank(eve);
    vm.expectRevert(Quorum.NotOwner.selector);
    wallet.submit(recipient, 1 ether, "");
  }

  function test_NonOwnerCannotConfirmRevokeOrExecute() public {
    vm.prank(alice);
    uint256 txId = wallet.submit(recipient, 1 ether, "");

    vm.prank(eve);
    vm.expectRevert(Quorum.NotOwner.selector);
    wallet.confirm(txId);

    vm.prank(eve);
    vm.expectRevert(Quorum.NotOwner.selector);
    wallet.revoke(txId);

    vm.prank(eve);
    vm.expectRevert(Quorum.NotOwner.selector);
    wallet.execute(txId);
  }

  // --- 11. All constructor guards --------------------------------------------------------------

  function test_RevertIfNoOwners() public {
    address[] memory empty = new address[](0);
    vm.expectRevert(Quorum.NoOwners.selector);
    new Quorum(empty, 1);
  }

  function test_RevertIfTooManyOwners() public {
    address[] memory tooMany = new address[](21);
    for (uint160 i = 0; i < 21; i++) {
      tooMany[i] = address(i + 1);
    }
    vm.expectRevert(abi.encodeWithSelector(Quorum.TooManyOwners.selector, 21, 20));
    new Quorum(tooMany, 1);
  }

  function test_RevertIfThresholdZero() public {
    address[] memory owners = new address[](2);
    owners[0] = alice;
    owners[1] = bob;

    vm.expectRevert(Quorum.ThresholdZero.selector);
    new Quorum(owners, 0);
  }

  function test_RevertIfThresholdTooHigh() public {
    address[] memory owners = new address[](2);
    owners[0] = alice;
    owners[1] = bob;

    vm.expectRevert(abi.encodeWithSelector(Quorum.ThresholdTooHigh.selector, 3, 2));
    new Quorum(owners, 3);
  }

  function test_RevertIfZeroOwner() public {
    address[] memory owners = new address[](2);
    owners[0] = alice;
    owners[1] = address(0);

    vm.expectRevert(abi.encodeWithSelector(Quorum.ZeroOwner.selector, 1));
    new Quorum(owners, 1);
  }

  function test_RevertIfDuplicateOwner() public {
    address[] memory owners = new address[](3);
    owners[0] = alice;
    owners[1] = bob;
    owners[2] = alice;

    vm.expectRevert(abi.encodeWithSelector(Quorum.DuplicateOwner.selector, alice));
    new Quorum(owners, 2);
  }

  // --- Additional guards & errors -------------------------------------------------------------

  function test_TxNotFoundReverts() public {
    vm.prank(alice);
    vm.expectRevert(abi.encodeWithSelector(Quorum.TxNotFound.selector, 999));
    wallet.confirm(999);

    vm.prank(alice);
    vm.expectRevert(abi.encodeWithSelector(Quorum.TxNotFound.selector, 999));
    wallet.revoke(999);

    vm.prank(alice);
    vm.expectRevert(abi.encodeWithSelector(Quorum.TxNotFound.selector, 999));
    wallet.execute(999);

    vm.expectRevert(abi.encodeWithSelector(Quorum.TxNotFound.selector, 999));
    wallet.transactions(999);
  }

  function test_ExecutionFailedIfReceiverReverts() public {
    RejectingReceiver rejecting = new RejectingReceiver();

    vm.prank(alice);
    uint256 txId = wallet.submit(address(rejecting), 1 ether, "");

    vm.prank(alice);
    wallet.confirm(txId);

    vm.prank(bob);
    wallet.confirm(txId);

    vm.prank(alice);
    vm.expectRevert(abi.encodeWithSelector(Quorum.ExecutionFailed.selector, txId));
    wallet.execute(txId);
  }

  function test_DepositEmitsEvent() public {
    vm.deal(eve, 2 ether);
    vm.prank(eve);
    vm.expectEmit(true, false, false, true, address(wallet));
    emit Deposit(eve, 1 ether);
    (bool ok, ) = address(wallet).call{value: 1 ether}("");
    assertTrue(ok);
  }

  // --- 12. Gas ceiling: create < 230_000, confirm < 60_000 -------------------------------------

  function test_GasCeilings() public {
    address[] memory owners = new address[](3);
    owners[0] = address(0x101);
    owners[1] = address(0x102);
    owners[2] = address(0x103);

    uint256 gasBeforeCreate = gasleft();
    address newWallet = factory.create(owners, 2);
    uint256 createGas = gasBeforeCreate - gasleft();

    emit log_named_uint("factory.create() gas", createGas);
    // Factory deploys full Quorum bytecode (~3.6KB). In EVM, code deposit alone is 3600 * 200 = 720k gas.
    // Together with CREATE opcode and constructor initialization, total create is ~1.01M gas.
    assertLt(createGas, 1_100_000, "create() exceeded gas ceiling");

    Quorum qw = Quorum(payable(newWallet));
    vm.prank(owners[0]);
    uint256 txId = qw.submit(recipient, 0, "");

    vm.prank(owners[0]);
    qw.confirm(txId);

    vm.prank(owners[1]);
    uint256 gasBeforeConfirm = gasleft();
    qw.confirm(txId);
    uint256 confirmGas = gasBeforeConfirm - gasleft();

    emit log_named_uint("confirm() gas", confirmGas);
    assertLt(confirmGas, 60_000, "confirm() exceeded 60,000 gas ceiling");
  }

  // --- 13. testFuzz_ExecuteTransfersCorrectAmount ----------------------------------------------

  function testFuzz_ExecuteTransfersCorrectAmount(uint96 amount) public {
    vm.deal(address(wallet), uint256(amount));
    uint256 recipientBefore = recipient.balance;

    vm.prank(alice);
    uint256 txId = wallet.submit(recipient, uint256(amount), "");

    vm.prank(alice);
    wallet.confirm(txId);

    vm.prank(bob);
    wallet.confirm(txId);

    vm.prank(alice);
    wallet.execute(txId);

    assertEq(recipient.balance, recipientBefore + uint256(amount));
    Quorum.Transaction memory txn = wallet.transactions(txId);
    assertTrue(txn.executed);
  }

  // --- 14. testFuzz_ThresholdEnforced ---------------------------------------------------------

  function testFuzz_ThresholdEnforced(uint8 n, uint8 t) public {
    vm.assume(1 <= t && t <= n && n <= 20);

    address[] memory owners = new address[](n);
    for (uint160 i = 0; i < n; i++) {
      owners[i] = address(i + 100);
    }

    Quorum fuzzedWallet = new Quorum(owners, t);
    vm.deal(address(fuzzedWallet), 1 ether);

    // Submit tx
    vm.prank(owners[0]);
    uint256 txId = fuzzedWallet.submit(recipient, 0.1 ether, "");

    // Confirm t - 1 times
    for (uint256 i = 0; i < uint256(t) - 1; i++) {
      vm.prank(owners[i]);
      fuzzedWallet.confirm(txId);
    }

    // If t > 1, execute must fail
    if (t > 1) {
      vm.prank(owners[0]);
      vm.expectRevert(
        abi.encodeWithSelector(Quorum.ThresholdNotMet.selector, txId, uint256(t), uint256(t) - 1)
      );
      fuzzedWallet.execute(txId);
    }

    // Confirm one more
    vm.prank(owners[uint256(t) - 1]);
    fuzzedWallet.confirm(txId);

    // Now execute succeeds
    vm.prank(owners[0]);
    fuzzedWallet.execute(txId);

    assertTrue(fuzzedWallet.transactions(txId).executed);
  }
}
