// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./PrivacyPool.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract PrivacyPoolFactory is ReentrancyGuard {
    event PrivacyPoolCreated(
        address indexed privacyPool,
        address indexed asset,
        uint256 denomination
    );

    error PreviousPoolTreeLimitNotReached(address asset, uint256 power);
    error PoolInputNotAllowed(address asset, uint256 power);
    error PoolUnknown(address asset, uint256 power, uint256 index);
    error WithdrawFailed();

    address constant public NATIVE = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    uint256 constant public MAX_TREE_LIMIT = 1048576;
    address public poseidon;

    // All existing pools grouped by asset and power (10**x).
    // asset => power => pools[]
    mapping(address => mapping(uint256 => address[])) public poolGroups;

    /// @notice Returns the list of pools under a given asset and power
    /// @param asset That is being deposited and withdrawn from the pool
    /// @param power Number x used in the equation 10**x to determine how much of the
    /// asset to deposit. This number is limited to 77
    /// @return pools List with all pool addresses that exist under the same asset and power
    function poolGroupByInput(address asset, uint256 power) external view returns(address[] memory pools) {
        pools = poolGroups[asset][power];
    }

    /// @notice Returns the length of the group list
    /// @param asset That is being deposited and withdrawn from the pool
    /// @param power Number x used in the equation 10**x to determine how much of the
    /// asset to deposit. This number is limited to 77
    /// @return length Of the pool group under the same asset and power
    function poolGroupLength(address asset, uint256 power) external view returns(uint256 length) {
        length = poolGroups[asset][power].length;
    }

    constructor(address _poseidon) {
        poseidon = _poseidon;
    }

    /// @notice Creates a new PrivacyTokenPool. Anyone is allowed to create a new pool
    /// if particular combination of asset/power does not exist yet or if the previous pool
    /// has reached it's max tree limit - 1048576 insertions.
    /// @param asset That is being deposited and withdrawn from the pool
    /// @param power Number x used in the equation 10**x to determine how much of the
    /// asset to deposit. This number is limited to 77
    /// @return pool Address of the created pool
    function createPool(
        address asset,
        uint256 power
    ) external returns(address pool) {
        if (power > 77) {
            revert PoolInputNotAllowed(asset, power);
        }
        // non-comprehensive erc20 filter
        if (asset != NATIVE && IERC20(asset).totalSupply() == 0) {
            revert PoolInputNotAllowed(asset, power);
        }
        uint256 denomination = 10**power;
        uint256 len = poolGroups[asset][power].length;
        if (len == 0) {
            // this is the first pool
            pool = address(new PrivacyPool(poseidon, asset, denomination));
            poolGroups[asset][power].push(pool);
            emit PrivacyPoolCreated(pool, asset, denomination);
        } else {
            // only allow to create next pool if the previous pool deposit tree limit is reached
            PrivacyPool currentPool = PrivacyPool(poolGroups[asset][power][len - 1]);
            if (currentPool.currentLeafIndex() < MAX_TREE_LIMIT) {
                revert PreviousPoolTreeLimitNotReached(asset, power);
            }
            pool = address(new PrivacyPool(poseidon, asset, denomination));
            poolGroups[asset][power].push(pool);
            emit PrivacyPoolCreated(pool, asset, denomination);
        }
    }
}
