// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {Test} from "forge-std/Test.sol";
import {HundiBytes} from "../src/HundiBytes.sol";

contract VectorsTest is Test {
    string private json;

    function setUp() public {
        json = vm.readFile("../vectors/golden.json");
    }

    function _b32(uint256 i, string memory field) private view returns (bytes32) {
        return vm.parseJsonBytes32(json, _path(i, field));
    }

    function _u64(uint256 i, string memory field) private view returns (uint64) {
        return uint64(vm.parseUint(vm.parseJsonString(json, _path(i, field))));
    }

    function _addr(uint256 i, string memory field) private view returns (address) {
        return vm.parseJsonAddress(json, _path(i, field));
    }

    function _path(uint256 i, string memory field) private pure returns (string memory) {
        return string.concat(".cases[", vm.toString(i), "].", field);
    }

    function test_everyHashMatchesTheGoldenVectors() public view {
        for (uint256 i = 0; i < 2; i++) {
            bytes32 dom = HundiBytes.domain(_u64(i, "chainId"), _addr(i, "vault"));
            assertEq(dom, _b32(i, "domain"), "domain");

            bytes32 x = _b32(i, "ownerX");
            bytes32 y = _b32(i, "ownerY");
            assertEq(HundiBytes.keyId(x, y), _b32(i, "keyId"), "keyId");

            bytes16 serial = bytes16(vm.parseJsonBytes(json, _path(i, "serial")));
            bytes32 id = HundiBytes.noteId(dom, serial, _u64(i, "face"), _u64(i, "expiry"), x, y);
            assertEq(id, _b32(i, "noteId"), "noteId");

            bytes32 first = HundiBytes.hopLink(id, _b32(i, "secondX"), _b32(i, "secondY"));
            assertEq(first, _b32(i, "firstHopLink"), "first hop");

            bytes32 second = HundiBytes.hopLink(first, _b32(i, "thirdX"), _b32(i, "thirdY"));
            assertEq(second, _b32(i, "secondHopLink"), "second hop");

            assertEq(HundiBytes.settleLink(second, _addr(i, "payTo"), _u64(i, "fee")), _b32(i, "settleLink"), "settle");
            assertEq(
                HundiBytes.withdrawLink(dom, _b32(i, "keyId"), _addr(i, "payTo"), _u64(i, "lockedUntil")),
                _b32(i, "withdrawLink"),
                "withdraw"
            );
        }
    }
}
