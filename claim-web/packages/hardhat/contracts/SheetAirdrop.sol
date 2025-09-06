// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract EthWarsaw2025Airdrop {
    address public owner;
    uint256 public constant AIRDROP_AMOUNT = 0.01 ether;
    uint256 public constant MAX_CLAIMANTS = 1000;
    uint256 public totalClaimants = 0;
    mapping(address => bool) public hasClaimed;

    constructor() {
        owner = msg.sender;
    }

    // allow owner to fund the contract
    receive() external payable {}

    function claimAirdropEthWarsaw2025() external {
        require(!hasClaimed[msg.sender], "Already claimed");
        require(totalClaimants < MAX_CLAIMANTS, "Airdrop finished");
        require(address(this).balance >= AIRDROP_AMOUNT, "Not enough funds");

        hasClaimed[msg.sender] = true;
        totalClaimants++;
        payable(msg.sender).transfer(AIRDROP_AMOUNT);
    }
}
