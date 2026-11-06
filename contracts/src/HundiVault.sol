// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {HundiBytes} from "./HundiBytes.sol";
import {P256} from "./P256.sol";

interface IUSDT3009 {
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
    function transfer(address to, uint256 value) external returns (bool);
}

struct NoteIn {
    bytes16 serial;
    uint64 face;
    uint64 expiry;
}

struct LoadArgs {
    bytes32 x;
    bytes32 y;
    uint128 bond;
    uint64 lockedUntil;
    uint64 fee;
    NoteIn[] notes;
}

struct Permit {
    address from;
    uint256 validAfter;
    uint256 validBefore;
    uint8 v;
    bytes32 r;
    bytes32 s;
}

struct Header {
    bytes16 serial;
    uint64 face;
    uint64 expiry;
    bytes32 x;
    bytes32 y;
}

struct Hop {
    bytes32 x;
    bytes32 y;
    bytes32 r;
    bytes32 s;
}

struct Auth {
    address payTo;
    uint64 fee;
    bytes32 r;
    bytes32 s;
}

/// @notice Offline USDT notes. Each holder may sign exactly one message at their slot.
/// Two different messages at one slot prove a cheat, and the cheater's bond pays for it.
contract HundiVault {
    struct Note {
        uint64 face;
        uint64 expiry;
        address refundTo;
        bool settled;
    }

    struct Bond {
        uint128 amount;
        uint64 lockedUntil;
        address funder;
    }

    uint256 public constant MAX_HOPS = 4;

    IUSDT3009 public immutable USDT;
    uint64 public immutable GRACE;
    uint64 public immutable MAX_LIFETIME;
    bytes32 public immutable DOMAIN;

    mapping(bytes32 noteId => Note) public notes;
    /// The first message recorded at each slot.
    mapping(bytes32 slot => bytes32 link) public spentBy;
    mapping(bytes32 keyId => Bond) public bonds;
    /// Slashed USDT, locked in the vault for good. A tally, so no claim depends on a burn transfer.
    uint256 public burned;

    event NoteLoaded(bytes32 indexed noteId, bytes32 indexed keyId, uint64 face, uint64 expiry);
    event BondChanged(bytes32 indexed keyId, uint128 amount, uint64 lockedUntil);
    event Settled(bytes32 indexed noteId, address payTo, uint256 paid, bytes32 liable);

    error BadExpiry();
    error BadSignature();
    error BondEmpty();
    error BondLocked();
    error BondTooSmall();
    error LockTooShort();
    error NotFunder();
    error NoteExists();
    error NoteExpired();
    error NoteNotExpired();
    error NoteSettled();
    error SlotSpent();
    error TooManyHops();
    error TransferFailed();
    error UnknownNote();
    error ZeroFace();

    constructor(IUSDT3009 usdt, uint64 grace, uint64 maxLifetime) {
        USDT = usdt;
        GRACE = grace;
        MAX_LIFETIME = maxLifetime;
        DOMAIN = HundiBytes.domain(uint64(block.chainid), address(this));
    }

    /// Mints notes and posts a bond. The funder's USDT signature pins every argument through its nonce.
    function load(LoadArgs calldata a, Permit calldata p) external {
        bytes32 key = HundiBytes.keyId(a.x, a.y);
        Bond storage bond = bonds[key];
        if (bond.funder == address(0)) {
            bond.funder = p.from;
        } else if (bond.funder != p.from) {
            revert NotFunder();
        }

        uint256 total;
        uint256 latest;
        for (uint256 i = 0; i < a.notes.length; i++) {
            NoteIn calldata n = a.notes[i];
            if (n.face == 0) revert ZeroFace();
            if (n.expiry <= block.timestamp || n.expiry > block.timestamp + MAX_LIFETIME) revert BadExpiry();
            bytes32 id = HundiBytes.noteId(DOMAIN, n.serial, n.face, n.expiry, a.x, a.y);
            if (notes[id].expiry != 0) revert NoteExists();
            notes[id] = Note(n.face, n.expiry, p.from, false);
            emit NoteLoaded(id, key, n.face, n.expiry);
            total += n.face;
            if (n.expiry > latest) latest = n.expiry;
        }

        uint128 amount = bond.amount + a.bond;
        if (amount < 2 * total) revert BondTooSmall();
        if (a.lockedUntil < bond.lockedUntil || a.lockedUntil < latest + GRACE) revert LockTooShort();
        bond.amount = amount;
        bond.lockedUntil = a.lockedUntil;
        emit BondChanged(key, amount, a.lockedUntil);

        bytes32 nonce = keccak256(abi.encode("HUNDI_LOAD", block.chainid, address(this), keccak256(abi.encode(a))));
        USDT.receiveWithAuthorization(
            p.from, address(this), total + a.bond + a.fee, p.validAfter, p.validBefore, nonce, p.v, p.r, p.s
        );
        _pay(msg.sender, a.fee);
    }

    /// The only way to get paid. Covers a normal redemption and a claim, so a carrier runs one path.
    function settle(Header calldata h, Hop[] calldata hops, Auth calldata a) external {
        bytes32 id = HundiBytes.noteId(DOMAIN, h.serial, h.face, h.expiry, h.x, h.y);
        Note storage note = notes[id];
        if (note.expiry == 0) revert UnknownNote();
        if (block.timestamp > uint256(note.expiry) + GRACE) revert NoteExpired();
        if (hops.length > MAX_HOPS) revert TooManyHops();

        bytes32 slot = id;
        bytes32 x = h.x;
        bytes32 y = h.y;
        bytes32 liable;
        for (uint256 i = 0; i < hops.length; i++) {
            Hop calldata hop = hops[i];
            bytes32 link = HundiBytes.hopLink(slot, hop.x, hop.y);
            if (!P256.verify(link, hop.r, hop.s, x, y)) revert BadSignature();
            bytes32 spent = spentBy[slot];
            if (spent == 0) {
                spentBy[slot] = link;
            } else if (spent != link) {
                // The deepest conflict wins, so a nested forker cannot push their cost upstream.
                liable = HundiBytes.keyId(x, y);
            }
            slot = link;
            x = hop.x;
            y = hop.y;
        }

        bytes32 tail = HundiBytes.settleLink(slot, a.payTo, a.fee);
        if (!P256.verify(tail, a.r, a.s, x, y)) revert BadSignature();
        if (spentBy[slot] != 0) revert SlotSpent();
        spentBy[slot] = tail;

        uint256 paid = h.face;
        if (liable == 0) {
            note.settled = true;
        } else {
            Bond storage bond = bonds[liable];
            if (bond.amount / 2 < paid) paid = bond.amount / 2;
            // An empty bond must not spend the victim's tail.
            if (paid == 0) revert BondEmpty();
            bond.amount -= uint128(2 * paid);
            burned += paid;
            emit BondChanged(liable, bond.amount, bond.lockedUntil);
        }
        emit Settled(id, a.payTo, paid, liable);

        uint256 fee = a.fee < paid ? a.fee : paid;
        _pay(a.payTo, paid - fee);
        _pay(msg.sender, fee);
    }

    /// Returns an unsettled note's face value after its settlement window closes.
    function reclaim(bytes32 noteId) external {
        Note storage note = notes[noteId];
        if (note.expiry == 0) revert UnknownNote();
        if (block.timestamp <= uint256(note.expiry) + GRACE) revert NoteNotExpired();
        if (note.settled) revert NoteSettled();
        note.settled = true;
        _pay(note.refundTo, note.face);
    }

    /// Pays out a bond after its lock. The key signs the payout address and the lock it saw.
    function withdrawBond(bytes32 x, bytes32 y, address payTo, bytes32 r, bytes32 s) external {
        bytes32 key = HundiBytes.keyId(x, y);
        Bond storage bond = bonds[key];
        uint64 lockedUntil = bond.lockedUntil;
        if (block.timestamp <= lockedUntil) revert BondLocked();
        bytes32 digest = HundiBytes.withdrawLink(DOMAIN, key, payTo, lockedUntil);
        if (!P256.verify(digest, r, s, x, y)) revert BadSignature();
        uint128 amount = bond.amount;
        if (amount == 0) revert BondEmpty();
        bond.amount = 0;
        emit BondChanged(key, 0, lockedUntil);
        _pay(payTo, amount);
    }

    /// Accepts empty or `true` return data, and skips zero amounts.
    function _pay(address to, uint256 amount) private {
        if (amount == 0) return;
        (bool ok, bytes memory data) = address(USDT).call(abi.encodeCall(IUSDT3009.transfer, (to, amount)));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }
}
