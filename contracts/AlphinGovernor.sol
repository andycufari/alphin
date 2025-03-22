// GOVERNOR FOR THE CRECIMIENTO HACKATON MARCH25
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/governance/Governor.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorCountingSimple.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotes.sol";

contract AlphinGovernor is Governor, GovernorCountingSimple, GovernorVotes {
    uint256 public constant VOTING_DELAY = 1;
    uint256 public constant VOTING_PERIOD = 50400;
    uint256 public constant PROPOSAL_THRESHOLD = 0;
    uint256 public constant QUORUM_PERCENTAGE = 20;

    constructor(
        IVotes _token
    ) Governor("Alphin Governor") GovernorVotes(_token) {}

    function votingDelay() public pure override returns (uint256) {
        return VOTING_DELAY;
    }

    function votingPeriod() public pure override returns (uint256) {
        return VOTING_PERIOD;
    }

    function proposalThreshold() public pure override returns (uint256) {
        return PROPOSAL_THRESHOLD;
    }

    function quorum(
        uint256 blockNumber
    ) public pure override returns (uint256) {
        return QUORUM_PERCENTAGE;
    }
}
