const { expect } = require("chai");
const { ethers } = require("hardhat");
const { generateProof } = require("../../lib/generateProof");
const { verifyProof } = require("../../lib/verifyProof");
const { poseidon, utils } = require("../../lib/index");
const { ACCESS_LIST_TYPE } = require("./constants");

const VERIFIER_JSON = require("../../circuits/out/withdraw_from_subset_verifier.json");
const WASM_FNAME = "./circuits/out/withdraw_from_subset_js/withdraw_from_subset.wasm";
const ZKEY_FNAME = "./circuits/out/withdraw_from_subset_final.zkey";

function padLeftHash(value) {
    return ethers.utils.hexZeroPad(value, 32);
}

function shuffleArray(array) {
    // https://stackoverflow.com/questions/2450954/how-to-randomize-shuffle-a-javascript-array
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

const generateWithdrawData = async (i, fixture, withdrawalOverrides = {}, accesListType = 0) => {
    const { assetMetadata, depositTree, emptyBlocklist, hackerBlocklist, recipients, relayer, secrets } = fixture;

    // Default inputs
    const { address: recipient } = recipients[i];
    const refund = 0n;
    const fee = ethers.utils.parseEther("0.001").toBigInt();
    const feeReceiver = relayer.address;
    const deadline = 0;
    const accessType = 0;
    const bitLength = 1;
    const subsetData = "0x00";

    // Merge with overrides
    const withdrawalData = {
        relayer: relayer.address,
        recipient,
        refund,
        fee,
        feeReceiver,
        deadline,
        accessType,
        bitLength,
        subsetData,
        ...withdrawalOverrides,
    };

    // private inputs
    const secret = secrets[i];
    const path = i;
    const { pathElements: mainProof, pathRoot: root } =
        await depositTree.path(path);
    const { pathElements: subsetProof, pathRoot: subsetRoot } = 
        await (accesListType === ACCESS_LIST_TYPE.Empty ? emptyBlocklist : hackerBlocklist).path(path);
    
    // public inputs
    const nullifier = poseidon([secret, 1, i]);
    const withdrawMetadata = utils.hashMod(
        ["address", "uint256", "address", "uint256", "uint256", "uint8", "uint24", "bytes"],
        [
            withdrawalData.recipient, 
            withdrawalData.refund, 
            withdrawalData.relayer, 
            withdrawalData.fee, 
            withdrawalData.deadline, 
            withdrawalData.accessType, 
            withdrawalData.bitLength, 
            withdrawalData.subsetData
        ]
    );

    // generate zkp
    const input = utils.toProofInput({
        root,
        subsetRoot,
        nullifier,
        assetMetadata,
        withdrawMetadata,
        secret,
        path,
        mainProof,
        subsetProof
    });

    const { proof, publicSignals } = await generateProof({
        input,
        wasmFileName: WASM_FNAME,
        zkeyFileName: ZKEY_FNAME
    });
    
    if (!await verifyProof({
        proof,
        publicSignals,
        verifierJson: VERIFIER_JSON,
    })) {
        throw new Error('proof verification failed')
    }
    const flatProof = utils.flattenProof(proof);

    return {
        flatProof,
        input,
        proof: {
            accessType: withdrawalData.accessType,
            bitLength: withdrawalData.bitLength,
            subsetData: withdrawalData.subsetData,
            flatProof,
            root: padLeftHash(root),
            subsetRoot: padLeftHash(subsetRoot),
            nullifier: padLeftHash(nullifier),
            recipient: withdrawalData.recipient,
            refund: withdrawalData.refund,
            relayer: withdrawalData.relayer,
            fee: withdrawalData.fee,
            deadline: withdrawalData.deadline,
        },
        feeReceiver: withdrawalData.feeReceiver,
    };
};

async function verifyWithdrawal(
    tx,
    privacyPool,
    amount,
    asset,
    proof,
    feeReceiver = proof.relayer,
    native = false
) {
    // check the event emitted with correct data
    await expect(tx)
        .to.emit(privacyPool, "Withdrawal")
        .withArgs(
            proof.recipient,
            proof.relayer,
            proof.subsetRoot,
            proof.nullifier,
            proof.fee,
        );

    if (native) {
        if (feeReceiver !== ethers.constants.AddressZero) {
            await expect(tx)
                .to.changeEtherBalances(
                    [feeReceiver, proof.recipient, privacyPool.address],
                    [proof.fee, amount - proof.fee, amount * -1n],
                );
        } else {
            await expect(tx)
                .to.changeEtherBalances(
                    [proof.recipient, privacyPool.address],
                    [amount, amount * -1n],
                );
        }
    } else {
        if (feeReceiver !== ethers.constants.AddressZero) {
            await expect(tx)
                .to.changeTokenBalances(asset,
                    [feeReceiver, proof.recipient, privacyPool.address],
                    [proof.fee, amount - proof.fee, amount * -1n],
                );
        } else {
            await expect(tx)
                .to.changeTokenBalances(asset,
                    [proof.recipient, privacyPool.address],
                    [amount, amount * -1n],
                );
        }
    }
}

module.exports = {
    generateWithdrawData,
    padLeftHash,
    shuffleArray,
    verifyWithdrawal,
};
