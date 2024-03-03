module.exports = {
  configureYulOptimizer: true,
  skipFiles: [
    'interface/IPoseidon.sol',
    'test/ReentrancyAttacker.sol',
    'test/TestFilledSubtreesFinder.sol',
    'test/Token.sol',
    'test/TestMerkleTree.sol',
    'verifiers/ProofLib.sol',
    'verifiers/withdraw_from_subset_verifier.sol',
    'IncrementalMerkleTree.sol'
  ],
}
