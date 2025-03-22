// GOVERNOR FOR THE CRECIMIENTO HACKATON MARCH25
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/governance/Governor.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorCountingSimple.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotes.sol";
import "@openzeppelin/contracts/metatx/ERC2771Context.sol";

contract AlphinGovernor is Governor, GovernorCountingSimple, GovernorVotes, ERC2771Context {
    uint256 public constant VOTING_DELAY = 1;
    uint256 public constant VOTING_PERIOD = 50400;
    uint256 public constant PROPOSAL_THRESHOLD = 0;
    uint256 public constant QUORUM_PERCENTAGE = 20;

    constructor(
        IVotes _token,
        address trustedForwarder
    ) Governor("Alphin Governor") GovernorVotes(_token) ERC2771Context(trustedForwarder) {}

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

    // Override _msgSender() and _msgData() to use ERC2771Context
    function _msgSender() internal view override(Context, ERC2771Context) returns (address sender) {
        return ERC2771Context._msgSender();
    }

    function _msgData() internal view override(Context, ERC2771Context) returns (bytes calldata) {
        return ERC2771Context._msgData();
    }

    // Override voting functions to use _msgSender()
    function castVote(uint256 proposalId, uint8 support) public override returns (uint256) {
        return super.castVote(proposalId, support, _msgSender());
    }

    function castVoteWithReason(uint256 proposalId, uint8 support, string memory reason) public override returns (uint256) {
        return super.castVoteWithReason(proposalId, support, reason, _msgSender());
    }

    function castVoteBySig(uint256 proposalId, uint8 support, uint8 v, bytes32 r, bytes32 s) public override returns (uint256) {
        return super.castVoteBySig(proposalId, support, v, r, s, _msgSender());
    }

}
