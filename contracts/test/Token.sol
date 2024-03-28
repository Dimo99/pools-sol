// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract Token is ERC20 {
  constructor(uint256 amount) ERC20("a", "A") {
    _mint(msg.sender, amount);
  }
  fallback() external {}
  receive() external payable {}
}