// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {Test} from "forge-std/Test.sol";
import {HundiBytes} from "../src/HundiBytes.sol";
import {Auth, Header, Hop, HundiVault, IUSDT3009, LoadArgs, NoteIn, Permit} from "../src/HundiVault.sol";

interface IERC20View {
    function balanceOf(address owner) external view returns (uint256);
}

/// Runs on a Whitechain fork against the real USDT. Each plan case is one test.
contract HundiVaultTest is Test {
    address private constant USDT = 0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7;
    uint256 private constant P256_N = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551;
    uint64 private constant GRACE = 1 hours;
    uint64 private constant MAX_LIFETIME = 7 days;
    uint64 private constant V = 5_000_000;
    bytes32 private constant RECEIVE_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );

    // P-256 private keys.
    uint256 private constant CUSTOMER = 0xC057;
    uint256 private constant STALL = 0x57A1;
    uint256 private constant SUPPLIER = 0x5099;
    uint256 private constant OTHER = 0x07E4;
    uint256 private constant SOCK = 0x50C4;

    HundiVault private vault;
    uint256 private funderKey = 0xF00D;
    uint256 private strangerKey = 0xBAD;
    address private funder;
    address private stranger;
    address private payTo = makeAddr("payTo");
    address private loserPayTo = makeAddr("loserPayTo");
    address private carrier = makeAddr("carrier");

    bytes32[] private trackedNotes;
    bytes32[] private trackedKeys;
    mapping(bytes32 key => bool) private isTracked;
    uint64 private nextSerial = 1;

    /// Every test ends by proving the vault's solvency.
    modifier solvent() {
        _;
        _assertSolvent(vault);
    }

    function setUp() public {
        vm.createSelectFork("whitechain");
        vault = new HundiVault(IUSDT3009(USDT), GRACE, MAX_LIFETIME);
        funder = vm.addr(funderKey);
        stranger = vm.addr(strangerKey);
        deal(USDT, funder, 1_000_000_000);
        deal(USDT, stranger, 1_000_000_000);
    }

    // --- Normal settlement ---

    function test_oneHopNoteSettlesAndPaysPayTo() public solvent {
        Header memory h = _loadOne(CUSTOMER, V, 2 * V);
        (Hop[] memory hops, bytes32 slot) = _path1(h, CUSTOMER, STALL);
        Auth memory a = _auth(STALL, slot, payTo, 20_000);

        vm.prank(carrier);
        vault.settle(h, hops, a);

        assertEq(_usdt(payTo), V - 20_000);
        assertEq(_usdt(carrier), 20_000);
        (,,, bool settled) = vault.notes(_id(h));
        assertTrue(settled);
    }

    function test_ownerCanSettleWithNoHops() public solvent {
        Header memory h = _loadOne(CUSTOMER, V, 2 * V);
        vault.settle(h, new Hop[](0), _auth(CUSTOMER, _id(h), payTo, 0));
        assertEq(_usdt(payTo), V);
    }

    function test_carrierCannotChangePayToOrFee() public solvent {
        Header memory h = _loadOne(CUSTOMER, V, 2 * V);
        (Hop[] memory hops, bytes32 slot) = _path1(h, CUSTOMER, STALL);
        Auth memory a = _auth(STALL, slot, payTo, 0);

        Auth memory redirected = a;
        redirected.payTo = carrier;
        vm.expectRevert(HundiVault.BadSignature.selector);
        vault.settle(h, hops, redirected);

        Auth memory feeRaised = _auth(STALL, slot, payTo, 0);
        feeRaised.fee = V;
        vm.expectRevert(HundiVault.BadSignature.selector);
        vault.settle(h, hops, feeRaised);

        vault.settle(h, hops, _auth(STALL, slot, payTo, 0));
        assertEq(_usdt(payTo), V);
    }

    // --- Forks and claims ---

    function test_forkPaysLoserBurnsTheSameAndTakesDoubleFromForker() public solvent {
        Header memory h = _loadOne(CUSTOMER, V, 4 * V);
        (Hop[] memory first, bytes32 firstSlot) = _path1(h, CUSTOMER, SUPPLIER);
        (Hop[] memory second, bytes32 secondSlot) = _path1(h, CUSTOMER, STALL);

        vault.settle(h, first, _auth(SUPPLIER, firstSlot, payTo, 0));
        vault.settle(h, second, _auth(STALL, secondSlot, loserPayTo, 0));

        assertEq(_usdt(payTo), V);
        assertEq(_usdt(loserPayTo), V);
        assertEq(vault.burned(), V);
        assertEq(_bond(CUSTOMER), 2 * V);
    }

    function test_redeemFollowedByHandOnMakesRedeemerLiable() public solvent {
        Header memory h = _loadOne(CUSTOMER, V, 2 * V);
        _addBond(STALL, 2 * V);
        (Hop[] memory one, bytes32 stallSlot) = _path1(h, CUSTOMER, STALL);
        vault.settle(h, one, _auth(STALL, stallSlot, payTo, 0));

        (Hop[] memory two, bytes32 supplierSlot) = _path2(h, CUSTOMER, STALL, SUPPLIER);
        vault.settle(h, two, _auth(SUPPLIER, supplierSlot, loserPayTo, 0));

        assertEq(_usdt(loserPayTo), V);
        assertEq(_bond(STALL), 0);
        assertEq(_bond(CUSTOMER), 2 * V);
    }

    function test_nestedForkChargesTheDeepestForkerAndNobodyUpstreamTwice() public solvent {
        Header memory h = _loadOne(CUSTOMER, V, 4 * V);
        _addBond(STALL, 4 * V);

        // The customer pays the supplier, and the supplier redeems.
        (Hop[] memory honest, bytes32 honestSlot) = _path1(h, CUSTOMER, SUPPLIER);
        vault.settle(h, honest, _auth(SUPPLIER, honestSlot, payTo, 0));

        // The customer also pays the stall, who hands on to OTHER. The customer pays once.
        (Hop[] memory left, bytes32 leftSlot) = _path2(h, CUSTOMER, STALL, OTHER);
        vault.settle(h, left, _auth(OTHER, leftSlot, loserPayTo, 0));
        assertEq(_bond(CUSTOMER), 2 * V);
        assertEq(_bond(STALL), 4 * V);

        // The stall also hands on to SOCK. Two conflicts on this path, and only the deeper one pays.
        address third = makeAddr("third");
        (Hop[] memory right, bytes32 rightSlot) = _path2(h, CUSTOMER, STALL, SOCK);
        vault.settle(h, right, _auth(SOCK, rightSlot, third, 0));

        assertEq(_usdt(third), V);
        assertEq(_bond(CUSTOMER), 2 * V);
        assertEq(_bond(STALL), 2 * V);
        assertEq(vault.burned(), 2 * V);
    }

    function test_sockPuppetClaimRaceLeavesCheaterWithNetGainOfZeroOrLess() public solvent {
        uint256 deposited = V + 2 * V;
        Header memory h = _loadOne(CUSTOMER, V, 2 * V);
        (Hop[] memory victimA, bytes32 slotA) = _path1(h, CUSTOMER, STALL);
        (Hop[] memory victimB, bytes32 slotB) = _path1(h, CUSTOMER, SUPPLIER);
        (Hop[] memory sock, bytes32 slotS) = _path1(h, CUSTOMER, SOCK);

        // Two real victims each handed over goods worth V. The first settles from escrow.
        uint256 goodsTaken = 2 * V;
        vault.settle(h, victimA, _auth(STALL, slotA, payTo, 0));

        // The cheater races their own second key ahead of the other victim.
        address cheaterPayout = makeAddr("cheaterPayout");
        vault.settle(h, sock, _auth(SOCK, slotS, cheaterPayout, 0));

        // The bond is gone, so the other victim's claim reverts and leaves their tail intact.
        Auth memory victimAuth = _auth(SUPPLIER, slotB, loserPayTo, 0);
        vm.expectRevert(HundiVault.BondEmpty.selector);
        vault.settle(h, victimB, victimAuth);

        uint256 cheaterIn = goodsTaken + _usdt(cheaterPayout) + _bond(CUSTOMER);
        assertLe(cheaterIn, deposited);
        assertEq(vault.burned(), V);
    }

    function test_claimCannotRunTwiceForOneTail() public solvent {
        Header memory h = _loadOne(CUSTOMER, V, 6 * V);
        (Hop[] memory first, bytes32 firstSlot) = _path1(h, CUSTOMER, SUPPLIER);
        (Hop[] memory second, bytes32 secondSlot) = _path1(h, CUSTOMER, STALL);
        vault.settle(h, first, _auth(SUPPLIER, firstSlot, payTo, 0));

        Auth memory a = _auth(STALL, secondSlot, loserPayTo, 0);
        vault.settle(h, second, a);

        vm.expectRevert(HundiVault.SlotSpent.selector);
        vault.settle(h, second, a);

        // A fresh tail from the same holder at the same slot is refused too.
        Auth memory freshTail = _auth(STALL, secondSlot, carrier, 0);
        vm.expectRevert(HundiVault.SlotSpent.selector);
        vault.settle(h, second, freshTail);

        assertEq(_bond(CUSTOMER), 4 * V);
    }

    function test_holderWhoHandedOnCannotSettleAndNextHolderIsNeverCharged() public solvent {
        Header memory h = _loadOne(CUSTOMER, V, 2 * V);
        _addBond(SUPPLIER, 2 * V);
        (Hop[] memory two, bytes32 supplierSlot) = _path2(h, CUSTOMER, STALL, SUPPLIER);
        vault.settle(h, two, _auth(SUPPLIER, supplierSlot, payTo, 0));

        (Hop[] memory one, bytes32 stallSlot) = _path1(h, CUSTOMER, STALL);
        Auth memory late = _auth(STALL, stallSlot, loserPayTo, 0);
        vm.expectRevert(HundiVault.SlotSpent.selector);
        vault.settle(h, one, late);

        assertEq(_bond(SUPPLIER), 2 * V);
        assertEq(_usdt(loserPayTo), 0);
    }

    function test_claimAgainstEmptyBondRevertsAndLeavesVictimTailUnspent() public solvent {
        Header memory h = _loadOne(CUSTOMER, V, 2 * V);
        (Hop[] memory first, bytes32 firstSlot) = _path1(h, CUSTOMER, SUPPLIER);
        (Hop[] memory second, bytes32 secondSlot) = _path1(h, CUSTOMER, STALL);
        (Hop[] memory third, bytes32 thirdSlot) = _path1(h, CUSTOMER, OTHER);
        vault.settle(h, first, _auth(SUPPLIER, firstSlot, payTo, 0));
        vault.settle(h, second, _auth(STALL, secondSlot, carrier, 0));
        assertEq(_bond(CUSTOMER), 0);

        Auth memory a = _auth(OTHER, thirdSlot, loserPayTo, 0);
        vm.expectRevert(HundiVault.BondEmpty.selector);
        vault.settle(h, third, a);
        assertEq(vault.spentBy(thirdSlot), bytes32(0));

        // The tail survives, so the same claim works once the bond has money again.
        _addBond(CUSTOMER, 2 * V);
        vault.settle(h, third, a);
        assertEq(_usdt(loserPayTo), V);
    }

    function test_claimPaysOnlyWhatHalfTheBondCovers() public solvent {
        Header memory h = _loadOne(CUSTOMER, V, 2 * V);
        _addBond(STALL, V);
        (Hop[] memory one, bytes32 stallSlot) = _path1(h, CUSTOMER, STALL);
        vault.settle(h, one, _auth(STALL, stallSlot, payTo, 0));

        (Hop[] memory two, bytes32 supplierSlot) = _path2(h, CUSTOMER, STALL, SUPPLIER);
        vault.settle(h, two, _auth(SUPPLIER, supplierSlot, loserPayTo, 0));

        assertEq(_usdt(loserPayTo), V / 2);
        assertEq(vault.burned(), V / 2);
        assertEq(_bond(STALL), 0);
    }

    // --- Loading ---

    function test_loadRefusesSmallBondAndShortLock() public solvent {
        uint64 expiry = uint64(block.timestamp + 1 days);
        NoteIn[] memory notes = _notes(V, expiry);
        (bytes32 x, bytes32 y) = _pub(CUSTOMER);

        LoadArgs memory tooSmall = LoadArgs(x, y, 2 * V - 1, expiry + GRACE, 0, notes);
        Permit memory p = _permit(funderKey, tooSmall);
        vm.expectRevert(HundiVault.BondTooSmall.selector);
        vault.load(tooSmall, p);

        LoadArgs memory tooShort = LoadArgs(x, y, 2 * V, expiry + GRACE - 1, 0, notes);
        p = _permit(funderKey, tooShort);
        vm.expectRevert(HundiVault.LockTooShort.selector);
        vault.load(tooShort, p);
    }

    function test_loadRefusesBadExpiryAndZeroFaceAndReuse() public solvent {
        (bytes32 x, bytes32 y) = _pub(CUSTOMER);
        uint64 lockedUntil = uint64(block.timestamp + 30 days);

        LoadArgs memory past = LoadArgs(x, y, 2 * V, lockedUntil, 0, _notes(V, uint64(block.timestamp)));
        Permit memory p = _permit(funderKey, past);
        vm.expectRevert(HundiVault.BadExpiry.selector);
        vault.load(past, p);

        LoadArgs memory far =
            LoadArgs(x, y, 2 * V, lockedUntil, 0, _notes(V, uint64(block.timestamp) + MAX_LIFETIME + 1));
        p = _permit(funderKey, far);
        vm.expectRevert(HundiVault.BadExpiry.selector);
        vault.load(far, p);

        LoadArgs memory zero = LoadArgs(x, y, 2 * V, lockedUntil, 0, _notes(0, uint64(block.timestamp + 1 days)));
        p = _permit(funderKey, zero);
        vm.expectRevert(HundiVault.ZeroFace.selector);
        vault.load(zero, p);

        Header memory h = _loadOne(CUSTOMER, V, 2 * V);
        NoteIn[] memory again = new NoteIn[](1);
        again[0] = NoteIn(h.serial, h.face, h.expiry);
        LoadArgs memory reused = LoadArgs(x, y, 2 * V, lockedUntil, 0, again);
        p = _permit(funderKey, reused);
        vm.expectRevert(HundiVault.NoteExists.selector);
        vault.load(reused, p);
    }

    function test_loadPaysTheFeeToTheSubmitterAndPinsItsArguments() public solvent {
        uint64 expiry = uint64(block.timestamp + 1 days);
        (bytes32 x, bytes32 y) = _pub(CUSTOMER);
        LoadArgs memory a = LoadArgs(x, y, 2 * V, expiry + GRACE, 30_000, _notes(V, expiry));
        Permit memory p = _permit(funderKey, a);

        // A relayer cannot change what gets minted, because the nonce commits to every argument.
        LoadArgs memory changed = LoadArgs(x, y, 2 * V, expiry + GRACE, 30_000, _notes(V - 1, expiry));
        vm.expectRevert();
        vault.load(changed, p);

        vm.prank(carrier);
        vault.load(a, p);
        _trackKey(HundiBytes.keyId(x, y));
        trackedNotes.push(HundiBytes.noteId(vault.DOMAIN(), a.notes[0].serial, V, expiry, x, y));
        assertEq(_usdt(carrier), 30_000);
    }

    function test_strangerCannotAddToBondOrExtendLock() public solvent {
        _loadOne(CUSTOMER, V, 2 * V);
        (bytes32 x, bytes32 y) = _pub(CUSTOMER);
        (, uint64 lockedUntil,) = vault.bonds(HundiBytes.keyId(x, y));

        LoadArgs memory a = LoadArgs(x, y, 1, lockedUntil + 365 days, 0, new NoteIn[](0));
        Permit memory p = _permit(strangerKey, a);
        vm.expectRevert(HundiVault.NotFunder.selector);
        vault.load(a, p);

        (uint128 amount, uint64 after_, address bondFunder) = vault.bonds(HundiBytes.keyId(x, y));
        assertEq(amount, 2 * V);
        assertEq(after_, lockedUntil);
        assertEq(bondFunder, funder);
    }

    function test_lockCanOnlyGrow() public solvent {
        _loadOne(CUSTOMER, V, 2 * V);
        (bytes32 x, bytes32 y) = _pub(CUSTOMER);
        (, uint64 lockedUntil,) = vault.bonds(HundiBytes.keyId(x, y));

        LoadArgs memory a = LoadArgs(x, y, 1, lockedUntil - 1, 0, new NoteIn[](0));
        Permit memory p = _permit(funderKey, a);
        vm.expectRevert(HundiVault.LockTooShort.selector);
        vault.load(a, p);
    }

    // --- Signature and deployment binding ---

    function test_flippedSNeitherCreatesConflictNorBypassesSlotRule() public solvent {
        Header memory h = _loadOne(CUSTOMER, V, 4 * V);
        (Hop[] memory hops, bytes32 slot) = _path1(h, CUSTOMER, STALL);
        Auth memory a = _auth(STALL, slot, payTo, 0);
        vault.settle(h, hops, a);

        Hop[] memory flipped = new Hop[](1);
        flipped[0] = hops[0];
        flipped[0].s = bytes32(P256_N - uint256(hops[0].s));
        Auth memory flippedAuth = _auth(STALL, slot, payTo, 0);
        flippedAuth.s = bytes32(P256_N - uint256(a.s));

        // Same messages, so the same links: no conflict and no bond taken, only a spent slot.
        vm.expectRevert(HundiVault.SlotSpent.selector);
        vault.settle(h, flipped, flippedAuth);
        assertEq(_bond(CUSTOMER), 4 * V);
        assertEq(vault.burned(), 0);
    }

    function test_noteOnAnotherDeploymentFails() public solvent {
        Header memory h = _loadOne(CUSTOMER, V, 2 * V);
        (Hop[] memory hops, bytes32 slot) = _path1(h, CUSTOMER, STALL);
        Auth memory a = _auth(STALL, slot, payTo, 0);

        HundiVault other = new HundiVault(IUSDT3009(USDT), GRACE, MAX_LIFETIME);
        vm.expectRevert(HundiVault.UnknownNote.selector);
        other.settle(h, hops, a);
    }

    function test_tooManyHopsAndBadSignaturesAreRefused() public solvent {
        Header memory h = _loadOne(CUSTOMER, V, 2 * V);
        Auth memory ownerAuth = _auth(CUSTOMER, _id(h), payTo, 0);
        vm.expectRevert(HundiVault.TooManyHops.selector);
        vault.settle(h, new Hop[](5), ownerAuth);

        (Hop[] memory hops, bytes32 slot) = _path1(h, STALL, SUPPLIER);
        Auth memory forged = _auth(SUPPLIER, slot, payTo, 0);
        vm.expectRevert(HundiVault.BadSignature.selector);
        vault.settle(h, hops, forged);
    }

    function test_settleClosesAfterGrace() public solvent {
        Header memory h = _loadOne(CUSTOMER, V, 2 * V);
        (Hop[] memory hops, bytes32 slot) = _path1(h, CUSTOMER, STALL);
        Auth memory a = _auth(STALL, slot, payTo, 0);
        vm.warp(uint256(h.expiry) + GRACE + 1);
        vm.expectRevert(HundiVault.NoteExpired.selector);
        vault.settle(h, hops, a);
    }

    // --- Reclaim and withdrawal ---

    function test_reclaimWorksOnlyAfterGraceAndOnlyForUnsettledNote() public solvent {
        Header memory open = _loadOne(CUSTOMER, V, 2 * V);
        Header memory done = _loadOne(CUSTOMER, V, 2 * V);
        (Hop[] memory hops, bytes32 slot) = _path1(done, CUSTOMER, STALL);
        vault.settle(done, hops, _auth(STALL, slot, payTo, 0));

        bytes32 id = _id(open);
        vm.warp(uint256(open.expiry) + GRACE);
        vm.expectRevert(HundiVault.NoteNotExpired.selector);
        vault.reclaim(id);

        vm.warp(uint256(open.expiry) + GRACE + 1);
        uint256 before = _usdt(funder);
        vault.reclaim(id);
        assertEq(_usdt(funder), before + V);

        vm.expectRevert(HundiVault.NoteSettled.selector);
        vault.reclaim(id);

        bytes32 doneId = _id(done);
        vm.expectRevert(HundiVault.NoteSettled.selector);
        vault.reclaim(doneId);

        vm.expectRevert(HundiVault.UnknownNote.selector);
        vault.reclaim(bytes32(uint256(1)));
    }

    function test_withdrawBondWorksOnlyAfterLockedUntil() public solvent {
        _loadOne(CUSTOMER, V, 2 * V);
        (bytes32 x, bytes32 y) = _pub(CUSTOMER);
        bytes32 key = HundiBytes.keyId(x, y);
        (, uint64 lockedUntil,) = vault.bonds(key);
        bytes32 digest = HundiBytes.withdrawLink(vault.DOMAIN(), key, payTo, lockedUntil);
        (bytes32 r, bytes32 s) = vm.signP256(CUSTOMER, digest);

        vm.warp(lockedUntil);
        vm.expectRevert(HundiVault.BondLocked.selector);
        vault.withdrawBond(x, y, payTo, r, s);

        vm.warp(uint256(lockedUntil) + 1);
        vm.expectRevert(HundiVault.BadSignature.selector);
        vault.withdrawBond(x, y, carrier, r, s);

        vault.withdrawBond(x, y, payTo, r, s);
        assertEq(_usdt(payTo), 2 * V);
        assertEq(_bond(CUSTOMER), 0);

        vm.expectRevert(HundiVault.BondEmpty.selector);
        vault.withdrawBond(x, y, payTo, r, s);
    }

    // --- Helpers ---

    function _assertSolvent(HundiVault v) private view {
        uint256 expected = v.burned();
        for (uint256 i = 0; i < trackedNotes.length; i++) {
            (uint64 face,,, bool settled) = v.notes(trackedNotes[i]);
            if (!settled) expected += face;
        }
        for (uint256 i = 0; i < trackedKeys.length; i++) {
            (uint128 amount,,) = v.bonds(trackedKeys[i]);
            expected += amount;
        }
        assertEq(_usdt(address(v)), expected, "vault balance != unsettled + bonds + burned");
    }

    function _usdt(address who) private view returns (uint256) {
        return IERC20View(USDT).balanceOf(who);
    }

    function _pub(uint256 key) private pure returns (bytes32, bytes32) {
        (uint256 x, uint256 y) = vm.publicKeyP256(key);
        return (bytes32(x), bytes32(y));
    }

    function _bond(uint256 key) private view returns (uint256 amount) {
        (bytes32 x, bytes32 y) = _pub(key);
        (amount,,) = vault.bonds(HundiBytes.keyId(x, y));
    }

    function _id(Header memory h) private view returns (bytes32) {
        return HundiBytes.noteId(vault.DOMAIN(), h.serial, h.face, h.expiry, h.x, h.y);
    }

    function _notes(uint64 face, uint64 expiry) private returns (NoteIn[] memory notes) {
        notes = new NoteIn[](1);
        notes[0] = NoteIn(bytes16(uint128(nextSerial++)), face, expiry);
    }

    function _loadOne(uint256 key, uint64 face, uint128 bondAmount) private returns (Header memory h) {
        (bytes32 x, bytes32 y) = _pub(key);
        uint64 expiry = uint64(block.timestamp + 1 days);
        NoteIn[] memory notes = _notes(face, expiry);
        (uint128 current, uint64 lock,) = vault.bonds(HundiBytes.keyId(x, y));
        uint64 lockedUntil = expiry + GRACE > lock ? expiry + GRACE : lock;
        uint128 extra = current >= 2 * face ? 0 : bondAmount;
        LoadArgs memory a = LoadArgs(x, y, extra, lockedUntil, 0, notes);
        vault.load(a, _permit(funderKey, a));
        h = Header(notes[0].serial, face, expiry, x, y);
        trackedNotes.push(_id(h));
        _trackKey(HundiBytes.keyId(x, y));
    }

    function _trackKey(bytes32 key) private {
        if (isTracked[key]) return;
        isTracked[key] = true;
        trackedKeys.push(key);
    }

    function _addBond(uint256 key, uint128 amount) private {
        (bytes32 x, bytes32 y) = _pub(key);
        (, uint64 lock,) = vault.bonds(HundiBytes.keyId(x, y));
        uint64 lockedUntil = lock == 0 ? uint64(block.timestamp + 2 days) : lock;
        LoadArgs memory a = LoadArgs(x, y, amount, lockedUntil, 0, new NoteIn[](0));
        vault.load(a, _permit(funderKey, a));
        _trackKey(HundiBytes.keyId(x, y));
    }

    function _permit(uint256 key, LoadArgs memory a) private view returns (Permit memory p) {
        uint256 value = uint256(a.bond) + a.fee;
        for (uint256 i = 0; i < a.notes.length; i++) {
            value += a.notes[i].face;
        }
        bytes32 nonce = keccak256(abi.encode("HUNDI_LOAD", block.chainid, address(vault), keccak256(abi.encode(a))));
        uint256 validBefore = type(uint256).max;
        address from = vm.addr(key);
        bytes32 structHash = keccak256(abi.encode(RECEIVE_TYPEHASH, from, address(vault), value, 0, validBefore, nonce));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _usdtDomain(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        p = Permit(from, 0, validBefore, v, r, s);
    }

    function _usdtDomain() private view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Tether USD"),
                keccak256("1"),
                block.chainid,
                USDT
            )
        );
    }

    function _hop(uint256 from, bytes32 slot, uint256 to) private view returns (Hop memory hop, bytes32 link) {
        (bytes32 x, bytes32 y) = _pub(to);
        link = HundiBytes.hopLink(slot, x, y);
        (bytes32 r, bytes32 s) = vm.signP256(from, link);
        hop = Hop(x, y, r, s);
    }

    function _path1(Header memory h, uint256 from, uint256 to) private view returns (Hop[] memory hops, bytes32 slot) {
        hops = new Hop[](1);
        (hops[0], slot) = _hop(from, _id(h), to);
    }

    function _path2(Header memory h, uint256 a, uint256 b, uint256 c)
        private
        view
        returns (Hop[] memory hops, bytes32 slot)
    {
        hops = new Hop[](2);
        (hops[0], slot) = _hop(a, _id(h), b);
        (hops[1], slot) = _hop(b, slot, c);
    }

    function _auth(uint256 key, bytes32 slot, address to, uint64 fee) private view returns (Auth memory a) {
        bytes32 digest = HundiBytes.settleLink(slot, to, fee);
        (bytes32 r, bytes32 s) = vm.signP256(key, digest);
        a = Auth(to, fee, r, s);
    }
}
