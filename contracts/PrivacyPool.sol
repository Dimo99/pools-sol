// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import { Address } from "@openzeppelin/contracts/utils/Address.sol";
import "./IncrementalMerkleTree.sol";
import "./verifiers/withdraw_from_subset_verifier.sol";

/// @title PrivacyPool - A smart contract for privacy-preserving deposits and withdrawals
/// @notice Allows to deposit any asset and withdraw maintaining privacy with voluntary anonymity sets
/// @author Ameen Soleimani
contract PrivacyPool is
    ReentrancyGuard,
    IncrementalMerkleTree,
    WithdrawFromSubsetVerifier
{
    using Address for address payable;
    using ProofLib for bytes;
    using SafeERC20 for IERC20;

    address constant public NATIVE = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    enum AccessType { BLOCKLIST, ALLOWLIST }

    /// @notice Data structure for withdrawal proof parameters included in the zkProof
    struct WithdrawalProof {
        AccessType accessType; // Type of access control (blocklist or allowlist)
        uint24 bitLength;      // Length of the deposit tree at the time of generating subsetData
        bytes subsetData;      // Sequence of bytes marking inclusion or exclusion in a particular subset of the deposit tree
        uint256[8] flatProof;  // User-generated zkProof for the withdrawal
        bytes32 root;          // Deposit tree root
        bytes32 subsetRoot;    // Proof of inclusion or exclusion in the particular subset
        bytes32 nullifier;     // Hash calculated from the secret and deposit leaf index
        address recipient;     // Address of the recipient
        uint256 refund;        // Amount of native asset to be passed along to the recipient when withdrawing from ERC20 pools
        address relayer;       // Address of an external relayer
        uint256 fee;           // Fee amount
        uint256 deadline;      // Deadline for withdrawal
    }

    /// @notice Data structure for withdrawal request including the fee receiver parameter set by the caller
    struct WithdrawalRequest {
        WithdrawalProof proof; // Withdrawal proof parameters
        address feeReceiver;   // Address that receives the fee
    }

    event Deposit(
        bytes32 indexed commitment,
        bytes32 indexed leaf,
        address indexed asset,
        uint256 denomination,
        uint256 leafIndex
    );

    event Withdrawal(
        address recipient,
        address indexed relayer,
        bytes32 indexed subsetRoot,
        bytes32 indexed nullifier,
        uint256 fee
    );

    error PrivacyPool__FeeExceedsDenomination();
    error PrivacyPool__InvalidZKProof();
    error PrivacyPool__MsgValueInvalid();
    error PrivacyPool__NoteAlreadySpent();
    error PrivacyPool__UnknownRoot();
    error PrivacyPool__ZeroAddress();
    error PrivacyPool__RelayerMismatch(address expected, address provided);
    error PrivacyPool__CallExpired();
    error PrivacyPool__DenominationInvalid();

    address public immutable asset;
    // denomination of deposits and withdrawals for this pool
    uint256 public immutable denomination;
    // double spend records
    mapping(bytes32 => bool) public nullifiers;

    constructor(address poseidon, address _asset, uint256 _denomination) ReentrancyGuard() IncrementalMerkleTree(poseidon) {
        if (poseidon == address(0)) {
            revert PrivacyPool__ZeroAddress();
        }
        if (_asset == address(0)) {
            revert PrivacyPool__ZeroAddress();
        }
        asset = _asset;
        if (_denomination == 0) {
            revert PrivacyPool__DenominationInvalid();
        }
        denomination = _denomination;
    }

    /// @notice Deposits a single commitment ensuring its validity
    /// @dev This function is payable but cannot be reentered
    /// For native asset, verifies that the sent value matches the denomination
    /// For ERC20 assets, the value must be zero, and the denomination is transferred from the sender to this contract
    /// @param commitment The single commitment to reference in the future
    /// @return leafIndex The location in the tree where the commitment was stored
    function deposit(bytes32 commitment) external payable nonReentrant returns(uint256) {
        return _deposit(msg.value, commitment);
    }

    function _deposit(uint256 value, bytes32 commitment) internal returns (uint256) {
        bytes32 assetMetadata = bytes32(abi.encodePacked(asset, denomination).snarkHash());
        bytes32 leaf = hasher.poseidon([commitment, assetMetadata]);
        uint256 leafIndex = insert(leaf);

        emit Deposit(
            commitment,
            leaf,
            asset,
            denomination,
            leafIndex
        );

        if (asset == NATIVE) {
            if (value != denomination) revert PrivacyPool__MsgValueInvalid();
        } else {
            if (value != 0) {
                revert PrivacyPool__MsgValueInvalid();
            }
            IERC20(asset).safeTransferFrom(msg.sender, address(this), denomination);
        }
        return leafIndex;
    }

    /// @notice Allows the caller to deposit multiple times into the contract
    /// @dev This method is payable but cannot be reentered
    /// It enforces particular value denominations to ensure correctness of deposits
    /// For native tokens, the total value sent must equal the denomination multiplied by the number of commitments
    /// For ERC20 tokens, the value must be zero
    /// @param commitments An array of commitments to be passed into _deposit
    /// @return leafIndices A set of leaf indices, with the same length as the commitments
    function depositMany(
        bytes32[] calldata commitments
    ) external payable nonReentrant returns(uint256[] memory leafIndices) {
        uint256 value = msg.value / commitments.length;
        leafIndices = new uint256[](commitments.length);
        uint256 i;
        do {
            leafIndices[i] = _deposit(value, commitments[i]);
            unchecked { ++i; }
        } while(i < commitments.length);
        return leafIndices;
    }

    function _verifyWithdrawal(WithdrawalProof calldata proof) internal view {
        if (!isKnownRoot(proof.root)) {
            revert PrivacyPool__UnknownRoot();
        }
        if (proof.fee > denomination) {
            revert PrivacyPool__FeeExceedsDenomination();
        }
        if (proof.recipient == address(0)) {
            revert PrivacyPool__ZeroAddress();
        }
        uint256 assetMetadata = abi.encodePacked(asset, denomination).snarkHash();
        uint256 withdrawMetadata = abi
            .encodePacked(
                proof.recipient,
                proof.refund,
                proof.relayer,
                proof.fee,
                proof.deadline,
                proof.accessType,
                proof.bitLength,
                proof.subsetData
            ).snarkHash();
        if (
            !_verifyWithdrawFromSubsetProof(
                proof.flatProof,
                uint256(proof.root),
                uint256(proof.subsetRoot),
                uint256(proof.nullifier),
                assetMetadata,
                withdrawMetadata
            )
        ) revert PrivacyPool__InvalidZKProof();
    }

    /// @notice Verifies a withdrawal proof without writing the proof
    /// @dev This method does not handle deadline, relayer, nor the nullifier check
    /// @param proof The withdrawal proof data to be verified
    function verifyWithdrawal(WithdrawalProof calldata proof) external view {
        _verifyWithdrawal(proof);
    }

    /// @notice Withdraws asset to the provided address based on the provided withdrawal proof
    /// @dev Verifies the validity of the withdrawal proof and handles asset transfers accordingly
    /// @param withdrawRequest Information needed to verify and process a withdrawal request
    function withdraw(WithdrawalRequest calldata withdrawRequest) external payable nonReentrant {
        WithdrawalProof calldata proof = withdrawRequest.proof;
        if (proof.deadline > 0 && block.timestamp > proof.deadline) revert PrivacyPool__CallExpired();
        if (proof.relayer != address(0) && proof.relayer != msg.sender) {
            revert PrivacyPool__RelayerMismatch({
                expected: proof.relayer,
                provided: msg.sender
            });
        }
        if (nullifiers[proof.nullifier]) revert PrivacyPool__NoteAlreadySpent();
        _verifyWithdrawal(proof);
        nullifiers[proof.nullifier] = true;
        emit Withdrawal(
            proof.recipient,
            proof.relayer,
            proof.subsetRoot,
            proof.nullifier,
            proof.fee
        );

        uint256 out = denomination;
        // feeReceiver is set by the msg.sender to direct fees,
        // they can refuse the fee by setting feeReceiver to address(0)
        if (withdrawRequest.feeReceiver != address(0)) {
            // checked in _verifyWithdrawal call above
            unchecked {
                out = denomination - proof.fee;
            }
        }
        if (asset == NATIVE) {
            // no refund available for native withdrawals
            if (msg.value != 0) revert PrivacyPool__MsgValueInvalid();
            payable(proof.recipient).sendValue(out);
            if (out < denomination) {
                payable(withdrawRequest.feeReceiver).sendValue(proof.fee);
            }
        } else {
            // refund available if non native token usage
            if (msg.value != proof.refund) revert PrivacyPool__MsgValueInvalid();
            if (proof.refund > 0) {
                payable(proof.recipient).sendValue(proof.refund);
            }
            IERC20(asset).safeTransfer(proof.recipient, out);
            if (out < denomination) {
                IERC20(asset).safeTransfer(withdrawRequest.feeReceiver, proof.fee);
            }
        }
    }
}
