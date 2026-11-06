// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

/// @notice Calls the RIP-7212 precompile. It returns empty bytes on failure, not zero.
library P256 {
    address internal constant VERIFIER = address(0x100);

    function verify(bytes32 digest, bytes32 r, bytes32 s, bytes32 x, bytes32 y) internal view returns (bool) {
        (bool ok, bytes memory out) = VERIFIER.staticcall(abi.encode(digest, r, s, x, y));
        return ok && out.length == 32 && abi.decode(out, (uint256)) == 1;
    }
}
