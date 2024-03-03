const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { deployedFixture } = require('./shared/fixtures');

const getFragmentInputs = (pool, name) => (
    Object.entries(pool.interface.functions).find(([sig, fn]) => fn.name === name)
)

describe('WithdrawalProof structs', function () {
    const deployedFx = deployedFixture();
    describe('encoding + decoding structs', () => {
        it('can encode and decode structs', async () => {
            const fixture = await loadFixture(deployedFx);
            const [signer] = fixture.signers;
            const now = Math.floor(Date.now() / 1000) + 1000;
            const proof = {
                accessType: 0,
                bitLength: 1,
                subsetData: '0x00',
                flatProof: [
                    ethers.constants.HashZero,
                    ethers.constants.HashZero,
                    ethers.constants.HashZero,
                    ethers.constants.HashZero,
                    ethers.constants.HashZero,
                    ethers.constants.HashZero,
                    ethers.constants.HashZero,
                    ethers.constants.HashZero,
                ],
                root: ethers.constants.HashZero,
                subsetRoot: ethers.constants.HashZero,
                nullifier: ethers.constants.HashZero,
                recipient: signer.address,
                refund: 0n,
                relayer: fixture.relayer.address,
                fee: 1n,
                deadline: now,
            }
            // by encoded fn
            const fnName = 'verifyWithdrawal';
            const encoded = fixture.privacyPool.interface.encodeFunctionData(fnName, [proof]);
            const { proof: decoded } = fixture.privacyPool.interface.decodeFunctionData(fnName, encoded);
            // by param
            const [sig, fragment] = getFragmentInputs(fixture.privacyPool, fnName);
            const encodedStruct = ethers.utils.defaultAbiCoder.encode(
                fragment.inputs,
                [proof],
            );
            const { proof: decodedProof } = ethers.utils.defaultAbiCoder.decode(
                fragment.inputs,
                encodedStruct,
            );
            expect(decoded).to.deep.equal(decodedProof);
        })
    })
})
