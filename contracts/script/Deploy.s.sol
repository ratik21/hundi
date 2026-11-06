// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {Script} from "forge-std/Script.sol";
import {HundiVault, IUSDT3009} from "../src/HundiVault.sol";

contract Deploy is Script {
    uint256 private constant WHITECHAIN_TESTNET = 1874;
    uint64 private constant GRACE = 1 hours;
    uint64 private constant MAX_LIFETIME = 7 days;

    function run() external returns (HundiVault vault) {
        require(block.chainid == WHITECHAIN_TESTNET, "testnet only");
        vm.startBroadcast(vm.envUint("RELAYER_PRIVATE_KEY"));
        vault = new HundiVault(IUSDT3009(vm.envAddress("USDT_ADDRESS")), GRACE, MAX_LIFETIME);
        vm.stopBroadcast();
    }
}
