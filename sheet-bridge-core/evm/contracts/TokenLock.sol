// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title TokenLock
 * @dev A contract that locks ERC20 tokens and emits events for cross-chain bridging
 * @notice Users can lock tokens by specifying a recipient address, and the owner can release locked tokens
 */
contract TokenLock is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // The ERC20 token that can be locked in this contract
    IERC20 public immutable bridgeToken;

    // Total amount of tokens currently locked in the contract
    uint256 public totalLockedTokens;

    /**
     * @dev Emitted when tokens are locked by a user
     * @param sender The address that locked the tokens
     * @param recipient The intended recipient address on the target chain
     * @param amount The amount of tokens locked
     */
    event TokensLocked(
        address indexed sender,
        address indexed recipient,
        uint256 amount
    );

    /**
     * @dev Emitted when the owner releases locked tokens
     * @param to The address receiving the tokens
     * @param amount The amount of tokens released
     */
    event TokensReleased(
        address indexed to,
        uint256 amount
    );

    /**
     * @dev Constructor to set the bridge token address and initial owner
     * @param _tokenAddress The address of the ERC20 token to be bridged
     * @param _owner The address of the contract owner
     */
    constructor(address _tokenAddress, address _owner) Ownable(_owner) {
        require(_tokenAddress != address(0), "TokenLock: token address cannot be zero");
        require(_owner != address(0), "TokenLock: owner address cannot be zero");

        bridgeToken = IERC20(_tokenAddress);
    }

    /**
     * @dev Lock tokens in the contract and emit TokensLocked event
     * @param amount The amount of tokens to lock
     * @param recipient The recipient address on the target chain (must be a valid Ethereum address)
     *
     * Requirements:
     * - amount must be greater than 0
     * - recipient must not be the zero address
     * - caller must have approved this contract to spend at least `amount` tokens
     * - caller must have sufficient token balance
     */
    function lock(uint256 amount, address recipient) external nonReentrant {
        require(amount > 0, "TokenLock: amount must be greater than 0");
        require(recipient != address(0), "TokenLock: recipient cannot be zero address");

        // Transfer tokens from sender to this contract
        bridgeToken.safeTransferFrom(msg.sender, address(this), amount);

        // Update total locked tokens
        totalLockedTokens += amount;

        // Emit event for off-chain indexers/bridges
        emit TokensLocked(msg.sender, recipient, amount);
    }

    /**
     * @dev Release locked tokens to a specified address (only callable by owner)
     * @param to The address to send the tokens to
     * @param amount The amount of tokens to release
     *
     * Requirements:
     * - caller must be the owner
     * - amount must be greater than 0
     * - to must not be the zero address
     * - contract must have sufficient locked tokens
     */
    function release(address to, uint256 amount) external onlyOwner nonReentrant {
        require(amount > 0, "TokenLock: amount must be greater than 0");
        require(to != address(0), "TokenLock: recipient cannot be zero address");
        require(amount <= totalLockedTokens, "TokenLock: insufficient locked tokens");

        // Update total locked tokens
        totalLockedTokens -= amount;

        // Transfer tokens to the recipient
        bridgeToken.safeTransfer(to, amount);

        // Emit event
        emit TokensReleased(to, amount);
    }

    /**
     * @dev Get the current token balance of this contract
     * @return The token balance
     */
    function getContractBalance() external view returns (uint256) {
        return bridgeToken.balanceOf(address(this));
    }
}
