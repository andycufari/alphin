// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../src/AlphinERC20.sol";
import "../src/Governor.sol";
import "@openzeppelin/contracts/governance/TimelockController.sol";

contract DeployScript is Script {
    // Governance parameters
    uint48 constant VOTING_DELAY = 1; // 1 block delay before voting starts
    uint48 constant VOTING_PERIOD = 50400; // ~1 week (assuming 12s blocks)
    uint256 constant PROPOSAL_THRESHOLD = 100 * 10 ** 18; // 100 tokens needed to create proposal
    uint256 constant QUORUM_PERCENTAGE = 4; // 4% quorum
    uint256 constant TIMELOCK_DELAY = 2 days; // 2 day delay for timelock

    function run() external {
        // Check if we're deploying to Sepolia or local
        bool isLocalNetwork = vm.envOr("NETWORK", string("local")) == "local";

        uint256 deployerPrivateKey;
        if (isLocalNetwork) {
            // Use a default private key for local deployment
            deployerPrivateKey = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
            console.log("Deploying to local network");
        } else {
            // Use the private key from environment for testnet deployment
            deployerPrivateKey = vm.envUint("PRIVATE_KEY");
            console.log("Deploying to Sepolia testnet");
        }

        vm.startBroadcast(deployerPrivateKey);

        // Deploy AlphinERC20
        AlphinERC20 token = new AlphinERC20();
        console.log("AlphinERC20 deployed at:", address(token));

        // Deploy TimelockController
        address[] memory proposers = new address[](1);
        address[] memory executors = new address[](1);

        // Initially empty arrays, the Governor will be added as proposer later
        TimelockController timelock = new TimelockController(
            TIMELOCK_DELAY,
            proposers,
            executors,
            address(0) // admin (0 address means no admin)
        );
        console.log("TimelockController deployed at:", address(timelock));

        // Deploy Governor
        CustomGovernor governor = new CustomGovernor(
            token,
            timelock,
            VOTING_DELAY,
            VOTING_PERIOD,
            PROPOSAL_THRESHOLD,
            QUORUM_PERCENTAGE
        );
        console.log("CustomGovernor deployed at:", address(governor));

        // Set up roles for the timelock
        bytes32 proposerRole = timelock.PROPOSER_ROLE();
        bytes32 executorRole = timelock.EXECUTOR_ROLE();
        bytes32 adminRole = timelock.TIMELOCK_ADMIN_ROLE();

        // Grant the governor the proposer role
        timelock.grantRole(proposerRole, address(governor));

        // Grant anyone the executor role (address(0) means anyone)
        timelock.grantRole(executorRole, address(0));

        // Revoke the admin role from the deployer
        timelock.revokeRole(adminRole, msg.sender);

        console.log("Governance setup completed successfully");

        vm.stopBroadcast();
    }
}
