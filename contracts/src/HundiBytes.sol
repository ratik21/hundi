// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

/// @notice The signed-message layouts from PLAN.md Appendix B. Must match packages/core/src/bytes.ts.
/// The hash chain covers messages and never signatures, because signatures are malleable.
library HundiBytes {
    function domain(uint64 chainId, address vault) internal pure returns (bytes32) {
        return sha256(abi.encodePacked("HUNDI/1", chainId, vault));
    }

    function keyId(bytes32 x, bytes32 y) internal pure returns (bytes32) {
        return sha256(abi.encodePacked(x, y));
    }

    function noteId(bytes32 dom, bytes16 serial, uint64 face, uint64 expiry, bytes32 x, bytes32 y)
        internal
        pure
        returns (bytes32)
    {
        return sha256(abi.encodePacked(uint8(0x01), dom, serial, face, expiry, x, y));
    }

    function hopLink(bytes32 slot, bytes32 toX, bytes32 toY) internal pure returns (bytes32) {
        return sha256(abi.encodePacked(uint8(0x02), slot, toX, toY));
    }

    function settleLink(bytes32 slot, address payTo, uint64 fee) internal pure returns (bytes32) {
        return sha256(abi.encodePacked(uint8(0x03), slot, payTo, fee));
    }

    function withdrawLink(bytes32 dom, bytes32 key, address payTo, uint64 lockedUntil) internal pure returns (bytes32) {
        return sha256(abi.encodePacked(uint8(0x04), dom, key, payTo, lockedUntil));
    }
}
