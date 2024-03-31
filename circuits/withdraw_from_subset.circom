pragma circom 2.1.8;

include "./common.circom";
include "./commitment_metadata.circom";
include "./shared_path_proof.circom";

template WithdrawFromSubset(levels, expectedValue) {
    /*
        Public Inputs
    */
    signal input root; // root of the commitments tree
    signal input subsetRoot; // root of the subset where the index of this commitment is approved
    signal input nullifier; // prevent double spend: nullifier = poseidon([secret, 1, path])
    signal input assetMetadata; // metadata injected into the commitment during the deposit phase
    signal input withdrawMetadata;// arbitrary withdrawa data (recipient relayer fee data etc.)

    /*
        Private Inputs
    */
    signal input secret; // preimage of the commitment
    signal input path; // path of the commitment in its tree
    signal input mainProof[levels]; // merkle proof of leaf to recover commitments root
    signal input subsetProof[levels]; // merkle proof of expected value to recover subset root

    // compute commitment and nullifier
    signal (hasherNullifier, commitment) <== CommitmentNullifierHasher()(secret, path, assetMetadata);

    // constrain nullifier is rightly derived from secret data
    nullifier === hasherNullifier;

    // setup both merkle trees with a single template.
    // they share the path, ie the proofs are identical branches in parallel trees
    signal (sharedProofRoot, sharedProofSubsetRoot) <== SharedPathProof(levels, expectedValue)(commitment, path, mainProof, subsetProof);

    // constrain commitment is member of commitments tree
    root === sharedProofRoot;
    // constrain index of commitment in subset contains the expected value
    subsetRoot === sharedProofSubsetRoot;

    // add withdrawal metadata to zkproof
    signal withdrawMetadataSquare;
    withdrawMetadataSquare <== withdrawMetadata * withdrawMetadata;
}

component main {
    public [
        root,
        subsetRoot,
        nullifier,
        assetMetadata,
        withdrawMetadata
    ]
} = WithdrawFromSubset(
    20,
    // keccak256("allowed") % p
    11954255677048767585730959529592939615262310191150853775895456173962480955685
);