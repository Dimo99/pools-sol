pragma circom 2.1.8;

include "../node_modules/circomlib/circuits/bitify.circom";
include "../node_modules/circomlib/circuits/poseidon.circom";

// hash two subnodes into a parent node
template Hash2Nodes() {
    signal input left;
    signal input right;
    signal output hash;

    hash <== Poseidon(2)([left, right]);
}

// correctly order two subnodes according to the merkle path
template DualMux() {
    signal input in[2];
    signal input s;
    signal output out[2];

    out[0] <== (in[1] - in[0])*s + in[0];
    out[1] <== (in[0] - in[1])*s + in[1];
}