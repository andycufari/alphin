// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract AlfinToken is ERC20Votes, Ownable {
    uint256 public constant INITIAL_SUPPLY = 1000000 * 10**18; // 1 millón de tokens
    mapping(address => bool) public hasJoined;

    constructor() ERC20("AlphinDAO Token", "ALF") ERC20Permit("AlfinDAO Token") {
        _mint(msg.sender, INITIAL_SUPPLY); // Admin recibe todos los tokens al inicio
    }

    function joinDAO() external {
        require(!hasJoined[msg.sender], "Already joined");
        uint256 tokensToMint = 100 * 10**18; // 100 ALF por usuario nuevo
        _mint(msg.sender, tokensToMint);
        _delegate(msg.sender, msg.sender); // Activa el spoder de voto

        hasJoined[msg.sender] = true;
    }
}
