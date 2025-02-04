// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract Token is ERC20 {
  constructor(uint256 amount) ERC20("a", "A") {
    _mint(msg.sender, amount);
  }
  fallback() external {}
  receive() external payable {}
}