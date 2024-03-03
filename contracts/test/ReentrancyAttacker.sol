// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "../PrivacyPool.sol";

contract ReentrancyAttacker {
    /*
        When the contract transfers the ETH to this contract, it tries to reenter the withdraw function.
        Realistically, the gas cost of processing the zkproof in the withdrawal function is much greater
        than the amount of gas forwarded during an ETH transfer, so this would fail regardless, but we
        can test the ReentrancyGuard contract because the revert condition will be checked immediately,
        before the gas is expended in the logic of the function.
    */

    fallback() external payable {
        PrivacyPool.WithdrawalRequest memory withdrawRequest = PrivacyPool.WithdrawalRequest({
            proof: PrivacyPool.WithdrawalProof({
                accessType: PrivacyPool.AccessType.BLOCKLIST,
                bitLength: 0,
                subsetData: "0x00",
                flatProof: [uint256(0), 0, 0, 0, 0, 0, 0, 0],
                root: 0,
                subsetRoot: 0,
                nullifier: 0,
                recipient: address(0),
                refund: 0,
                relayer: address(0),
                fee: 0,
                deadline: block.timestamp
            }),
            feeReceiver: address(0)
        });
        PrivacyPool(msg.sender).withdraw(withdrawRequest);
    }
}
