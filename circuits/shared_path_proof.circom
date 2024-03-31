pragma circom 2.1.8;

include "./common.circom";

/*
    A shared path proof is two inclusion proofs that share an identical path in two same-shape trees with different
    leaves in them. The second tree is an access list that gives permission on a per-index basis, eg to allow a
    withdrawal of commitment i, set the leaf at index i in the subset tree to `expectedValue`.
*/

template SharedPathProof(levels, expectedValue) {
    signal input leaf;
    signal input path;
    signal input mainProof[levels];
    signal input subsetProof[levels];

    signal output root;
    signal output subsetRoot;

    signal selectors1[levels][2];
    signal selectors2[levels][2];

    signal hashers1[levels];
    signal hashers2[levels];

    signal pathBits[levels] <== Num2Bits(levels)(path);

    for (var i = 0; i < levels; i++) {
        selectors1[i] <== DualMux()([i == 0 ? leaf : hashers1[i - 1], mainProof[i]], pathBits[i]);

        hashers1[i] <== Hash2Nodes()(selectors1[i][0], selectors1[i][1]);

        selectors2[i] <== DualMux()([i == 0 ? expectedValue : hashers2[i - 1], subsetProof[i]], pathBits[i]);

        hashers2[i] <== Hash2Nodes()(selectors2[i][0], selectors2[i][1]);
    }

    root <== hashers1[levels - 1];
    subsetRoot <== hashers2[levels - 1];
}