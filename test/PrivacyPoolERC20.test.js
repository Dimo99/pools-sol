const { expect } = require('chai');
const { ethers } = require('hardhat');
const { setStorageAt, loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { poseidon, utils } = require('../lib/index');
const { setNextBlockTimestamp } = require('../scripts/hardhat.utils');
const { deployedFixture, deployedAndDepositedFixture } = require("./shared/fixtures");
const { generateWithdrawData, padLeftHash, verifyWithdrawal } = require("./shared/utils");
const {
    ACCESS_LIST_TYPE,
    AVG_BLOCK_TIME,
    N_DEPOSITS,
    POOL_TYPE,
    WITHDRAWALS_TIMEOUT
} = require("./shared/constants");

const getFragmentInputs = (pool, name) => (
    Object.entries(pool.interface.functions).find(([sig, fn]) => fn.name === name)
);

describe('PrivacyPool.sol ERC20 token deposits', function () {
    describe('encoding structs', () => {
        const deployedFx = deployedFixture(POOL_TYPE.Token);
        it('can encode and decode structs', async () => {
            const fixture = await loadFixture(deployedFx);
            const [signer] = fixture.signers;
            const now = Math.floor(Date.now() / 1000) + 1000;
            const proof = {
                recipient: signer.address,
                accessType: 0,
                bitLength: 1,
                relayer: fixture.relayer.address,
                flatProof: [
                    ethers.constants.HashZero,
                    ethers.constants.HashZero,
                    ethers.constants.HashZero,
                    ethers.constants.HashZero,
                    ethers.constants.HashZero,
                    ethers.constants.HashZero,
                    ethers.constants.HashZero,
                    ethers.constants.HashZero
                ],
                root: ethers.constants.HashZero,
                subsetRoot: ethers.constants.HashZero,
                nullifier: ethers.constants.HashZero,
                refund: 0n,
                fee: 1n,
                deadline: now,
                subsetData: '0x00',
            };
            // by encoded fn
            const encoded = fixture.privacyPool.interface.encodeFunctionData('verifyWithdrawal', [proof]);
            expect(true).to.equal(true);
            const { proof: decoded } = fixture.privacyPool.interface.decodeFunctionData('verifyWithdrawal', encoded);
            // by param
            const [sig, fragment] = getFragmentInputs(fixture.privacyPool, 'verifyWithdrawal');
            const encodedStruct = ethers.utils.defaultAbiCoder.encode(
                fragment.inputs,
                [proof],
            );
            const { proof: decodedProof } = ethers.utils.defaultAbiCoder.decode(
                fragment.inputs,
                encodedStruct,
            );
            expect(decoded).to.deep.equal(decodedProof);
        }).timeout(WITHDRAWALS_TIMEOUT);
    });
    describe('deposits', () => {
        let asset;
        let assetAddress;
        let commitments;
        let denomination;
        let depositTree;
        let goodSigners;
        let hackerBlocklist;
        let multiDepositTree;
        let privacyPool;
        let rawCommitments;
        let signers;
        const deployedFx = deployedFixture(POOL_TYPE.Token);

        beforeEach(async () => {
            const fixture = await loadFixture(deployedFx);
            asset = fixture.asset;
            assetAddress = fixture.assetAddress;
            commitments = fixture.commitments;
            denomination = fixture.denomination;
            depositTree = fixture.depositTree;
            goodSigners = fixture.goodSigners;
            hackerBlocklist = fixture.hackerBlocklist;
            multiDepositTree = fixture.multiDepositTree;
            privacyPool = fixture.privacyPool;
            rawCommitments = fixture.rawCommitments;
            signers = fixture.signers;
        });
        it('fails if value is sent with deposit', async () => {
            const index = 0
            const signer = signers[index];
            await expect(privacyPool.connect(signer)
            .deposit(padLeftHash(rawCommitments[index]), {
                value: 1,
            })).to.be.revertedWithCustomError(privacyPool, 'PrivacyPool__MsgValueInvalid')
        })


        it('anyone can deposit', async () => {
            // check empty root before any deposits
            await expect(privacyPool.getLatestRoot())
                .eventually.to.be.equal(padLeftHash(depositTree.root));

            const latest = await privacyPool.provider.getBlock('latest');
            let timestamp = latest.timestamp;

            for (let i = 0; i < N_DEPOSITS; i++) {
                const signerIndex = i % signers.length;
                if (signerIndex >= goodSigners.length) {
                    hackerBlocklist.block(i);
                }
                // iterate through the signers for depositor variety
                const signer = signers[signerIndex];

                // send token to a signer
                await asset.transfer(signer.address, denomination);

                // approve PrivacyPool to access token on signers account
                await asset.connect(signer)
                    .approve(privacyPool.address, denomination);

                // force a specific timestamp (to check against block.timestamp emitted in event)
                timestamp += AVG_BLOCK_TIME;
                await setNextBlockTimestamp(timestamp);

                const tx = privacyPool.connect(signer)
                    .deposit(padLeftHash(rawCommitments[i]));
                // deposit using raw commitment, check event log data for commitment
                await expect(tx)
                    .to.emit(privacyPool, 'Deposit')
                    .withArgs(
                        rawCommitments[i],
                        commitments[i],
                        assetAddress,
                        denomination,
                        i,
                    );
                // check that the roots match between JS and evm
                await depositTree.insert(commitments[i]);
                await expect(privacyPool.getLatestRoot())
                    .eventually.to.be.equal(padLeftHash(depositTree.root));
                // check pool has received the token
                await expect(tx)
                    .to.changeTokenBalances(asset,
                        [privacyPool.address, signer.address],
                        [denomination, denomination * -1n],
                    );
            }
        }).timeout(WITHDRAWALS_TIMEOUT);

        it('anyone can make a multi-deposit', async () => {
            await expect(privacyPool.getLatestRoot())
                .eventually.to.be.equal(padLeftHash(multiDepositTree.root));

            // send token to a signer
            await asset.transfer(signers[0].address, denomination * BigInt(N_DEPOSITS));

            // approve PrivacyPool to access token on signers account
            await asset.connect(signers[0])
                .approve(privacyPool.address, denomination * BigInt(N_DEPOSITS));

            const paddedRawCommitments = rawCommitments.map(async (rawCommitment) => {
                return padLeftHash(rawCommitment);
            });

            commitments.forEach(async (commitment) => {
                await multiDepositTree.insert(commitment);
            })

            await privacyPool.connect(signers[0])
                .depositMany(paddedRawCommitments);

            await expect(privacyPool.getLatestRoot())
                .eventually.to.be.equal(padLeftHash(multiDepositTree.root));

        }).timeout(WITHDRAWALS_TIMEOUT);

        it('should revert with `MerkleTreeCapacity` when the tree is full', async () => {
            /*
                simulate a full tree by setting the `currentLeafIndex` variable using hardhat
                (it would take too long to compute 1048576 insertions in a hardhat test). the slot was
                found using `hardhat-storage-layout` and running the command `hardhat compile && hardhat check`.
            */
            await setStorageAt(
                privacyPool.address,
                1,
                2n ** 20n, // 1048576
            );
            await expect(
                privacyPool.deposit(padLeftHash('0x1234'), {
                    value: 1n,
                })
            ).to.be.revertedWithCustomError(
                privacyPool,
                'IncrementalMerkleTree__MerkleTreeCapacity',
            );
        }).timeout(WITHDRAWALS_TIMEOUT);
    });

    describe('withdrawals', () => {
        let fix;
        let asset;
        let assetAddress;
        let assetMetadata;
        let commitments;
        let denomination;
        let depositTree;
        let emptyBlocklist;
        let goodSigners;
        let privacyPool;
        let relayer;
        let secrets;
        let signers;
        let withdrawalOrder;
        const deployedAndDepositedFx = deployedAndDepositedFixture(POOL_TYPE.Token);

        beforeEach(async () => {
            const fixture = await loadFixture(deployedAndDepositedFx);
            fix = fixture;
            asset = fixture.asset;
            assetAddress = fixture.assetAddress;
            assetMetadata = fixture.assetMetadata;
            commitments = fixture.commitments;
            denomination = fixture.denomination;
            depositTree = fixture.depositTree;
            emptyBlocklist = fixture.emptyBlocklist;
            goodSigners = fixture.goodSigners;
            privacyPool = fixture.privacyPool;
            relayer = fixture.relayer;
            secrets = fixture.secrets;
            signers = fixture.signers;
            withdrawalOrder = fixture.withdrawalOrder;
        });
        describe('with empty blocklist', () => {
            it(`should process withdrawals using the empty block list`, async () => {
                for (const i of withdrawalOrder) {
                    const withdrawData = await generateWithdrawData(i, fix);

                    // verify proof using contract verifier
                    await expect(privacyPool.verifyWithdrawal(withdrawData.proof)).to.not.be.reverted;

                    const tx = privacyPool.connect(relayer).withdraw({
                        proof: withdrawData.proof,
                        feeReceiver: withdrawData.feeReceiver,
                    }, { value: withdrawData.proof.refund });
                    await verifyWithdrawal(
                        tx,
                        privacyPool,
                        denomination,
                        asset,
                        withdrawData.proof,
                        withdrawData.feeReceiver,
                        false
                    );
                }
            }).timeout(WITHDRAWALS_TIMEOUT);

            it(`should allow to withdraw with refund on ERC20 pools`, async () => {
                const refund = ethers.utils.parseEther('0.1').toBigInt();
                const withdrawData = await generateWithdrawData(0, fix, {
                    refund,
                });

                // verify proof using contract verifier
                await expect(privacyPool.verifyWithdrawal(withdrawData.proof)).to.not.be.reverted;

                const tx = privacyPool.connect(relayer).withdraw({
                    proof: withdrawData.proof,
                    feeReceiver: withdrawData.feeReceiver,
                }, { value: refund });
                await verifyWithdrawal(
                    tx,
                    privacyPool,
                    denomination,
                    asset,
                    withdrawData.proof,
                    withdrawData.feeReceiver,
                    false
                );
            }).timeout(WITHDRAWALS_TIMEOUT);

            it('should revert with `PrivacyPool__MsgValueInvalid()` if refund mismatches value', async () => {
                const refund = ethers.utils.parseEther('0.1').toBigInt();
                const withdrawData = await generateWithdrawData(0, fix, {
                    refund,
                });

                // verify proof using contract verifier
                expect(await privacyPool.verifyWithdrawal(withdrawData.proof)).to.not.be.reverted;

                await expect(privacyPool.connect(relayer).withdraw({
                    proof: withdrawData.proof,
                    feeReceiver: withdrawData.feeReceiver,
                }, {
                    value: 2n,
                })).to.be.revertedWithCustomError(
                    privacyPool,
                    'PrivacyPool__MsgValueInvalid',
                );
                await expect(privacyPool.connect(relayer).withdraw({
                    proof: withdrawData.proof,
                    feeReceiver: withdrawData.feeReceiver,
                }, {
                    value: refund,
                })).to.emit(privacyPool, 'Withdrawal');
            }).timeout(WITHDRAWALS_TIMEOUT);

            it('should revert with `PrivacyPool__FeeExceedsDenomination()`', async () => {
                const withdrawData = await generateWithdrawData(0, fix, {
                    fee: ethers.utils.parseEther('1.000000000000000001').toBigInt(),
                });
                await expect(privacyPool.connect(relayer).withdraw({
                    proof: withdrawData.proof,
                    feeReceiver: withdrawData.feeReceiver,
                }, {
                    value: withdrawData.proof.refund,
                })).to.be.revertedWithCustomError(
                    privacyPool,
                    'PrivacyPool__FeeExceedsDenomination',
                );
            }).timeout(WITHDRAWALS_TIMEOUT);

            it('should revert with deadline exceptions', async () => {
                const withdrawData = await generateWithdrawData(0, fix)
                const extension = { deadline: Math.floor(Date.now() / 1_000) }
                await expect(
                    privacyPool.connect(relayer).withdraw({
                        proof: {
                            ...withdrawData.proof,
                            ...extension,
                        },
                        feeReceiver: withdrawData.feeReceiver,
                    }, {
                        value: withdrawData.proof.refund,
                    })
                ).to.be.revertedWithCustomError(
                    privacyPool,
                    'PrivacyPool__CallExpired',
                );
            })
            it('should revert with address zero exception', async () => {
                const withdrawData = await generateWithdrawData(0, fix)
                const extension = { recipient: hre.ethers.constants.AddressZero }
                await expect(
                    privacyPool.connect(relayer).withdraw({
                        proof: {
                            ...withdrawData.proof,
                            ...extension,
                        },
                        feeReceiver: withdrawData.feeReceiver,
                    }, {
                        value: withdrawData.proof.refund,
                    })
                ).to.be.revertedWithCustomError(
                    privacyPool,
                    'PrivacyPool__ZeroAddress',
                );
            })
            it('sender can refuse fee', async () => {
                const withdrawData = await generateWithdrawData(0, fix)
                const { proof } = withdrawData
                const tx = privacyPool.connect(relayer).withdraw({
                    proof,
                    feeReceiver: hre.ethers.constants.AddressZero,
                })
                await expect(tx).not.to.be.rejected
                await expect(tx).to.emit(privacyPool, 'Withdrawal')
                    .withArgs(
                        proof.recipient,
                        proof.relayer,
                        proof.subsetRoot,
                        proof.nullifier,
                        proof.fee,
                    );
                await expect(tx).to.changeTokenBalances(asset,
                    [proof.recipient, relayer],
                    [denomination, 0],
                )
            })
            it('should revert with `PrivacyPool__InvalidZKProof()`', async () => {
                const withdrawData = await generateWithdrawData(0, fix);
                const extensions = [
                    { accessType: 1 },
                    { bitLength: 2 },
                    { subsetData: '0x0001' },
                    { recipient: withdrawData.feeReceiver },
                    { refund: 1n },
                    { relayer: ethers.constants.AddressZero },
                    { fee: ethers.utils.parseEther('0.999999999999999999') },
                    { deadline: Date.now() },
                ];
                // set recipient to feeReceiver address
                for (const extension of extensions) {
                    await expect(
                        privacyPool.connect(relayer).withdraw({
                            proof: {
                                ...withdrawData.proof,
                                ...extension,
                            },
                            feeReceiver: withdrawData.feeReceiver,
                        }, {
                            value: withdrawData.proof.refund,
                        })
                    ).to.be.revertedWithCustomError(
                        privacyPool,
                        'PrivacyPool__InvalidZKProof',
                    );
                }
            }).timeout(WITHDRAWALS_TIMEOUT);

            it('should revert with `PrivacyPool__UnknownRoot()`', async () => {
                const withdrawData = await generateWithdrawData(0, fix);
                // set recipient to feeReceiver address
                await expect(
                    privacyPool.connect(relayer).withdraw({
                        proof: {
                            ...withdrawData.proof,
                            root: ethers.constants.HashZero,
                        },
                        feeReceiver: withdrawData.feeReceiver,
                    }, {
                        value: withdrawData.proof.refund,
                    })
                ).to.be.revertedWithCustomError(
                    privacyPool,
                    'PrivacyPool__UnknownRoot',
                );
            }).timeout(WITHDRAWALS_TIMEOUT);

            it('should revert with `PrivacyPool__UnknownRoot()`', async () => {
                // try to withdraw by constructing a proof in an invalid tree
                // we're going to update a leaf and try to withdraw using that tree
                const secret = utils.randomFEs(1)[0];
                const fakeRawCommitment = poseidon([secret]);
                const fakeCommitment = poseidon([fakeRawCommitment, assetMetadata]);
                const path = 16;

                // try to spoof the 17th deposit (path = 16)
                depositTree.update(path, fakeCommitment);
                const { pathRoot: root } = depositTree.path(path);
                const { pathRoot: subsetRoot } = emptyBlocklist.path(path);

                // restore the tree to its valid state after the proof gets computed
                depositTree.update(path, commitments[path]);
                const withdrawData = await generateWithdrawData(0, fix);
                await expect(
                    privacyPool.connect(relayer).withdraw({
                        proof: {
                            ...withdrawData.proof,
                            root: padLeftHash(root),
                            subsetRoot: padLeftHash(subsetRoot),
                        },
                        feeReceiver: withdrawData.feeReceiver,
                    },
                        { value: withdrawData.proof.refund }
                    )
                ).to.be.revertedWithCustomError(
                    privacyPool,
                    'PrivacyPool__UnknownRoot',
                );
            }).timeout(WITHDRAWALS_TIMEOUT);

            it('should revert with `PrivacyPool__ZeroAddress()`', async () => {
                // check that recipient == zero address fails
                const withdrawData = await generateWithdrawData(0, fix);
                await expect(
                    privacyPool.connect(relayer).withdraw({
                        proof: {
                            ...withdrawData.proof,
                            recipient: ethers.constants.AddressZero,
                        },
                        feeReceiver: withdrawData.feeReceiver,
                    }, {
                        value: withdrawData.proof.refund,
                    })
                ).to.be.revertedWithCustomError(
                    privacyPool,
                    'PrivacyPool__ZeroAddress',
                );
            }).timeout(WITHDRAWALS_TIMEOUT);

            it('should revert with `PrivacyPool__NoteAlreadySpent()`', async () => {
                // valid withdraw using the nullifier (this spends the note)
                const withdrawData = await generateWithdrawData(0, fix);
                await privacyPool.connect(relayer).withdraw({
                    proof: withdrawData.proof,
                    feeReceiver: withdrawData.feeReceiver,
                }, {
                    value: withdrawData.proof.refund,
                });
                // try to double spend by submitting the same withdrawal again
                await expect(
                    privacyPool.connect(relayer).withdraw({
                        proof: withdrawData.proof,
                        feeReceiver: withdrawData.feeReceiver,
                    }, {
                        value: withdrawData.proof.refund,
                    })
                ).to.be.revertedWithCustomError(
                    privacyPool,
                    'PrivacyPool__NoteAlreadySpent',
                );
            }).timeout(WITHDRAWALS_TIMEOUT);

            it('should revert with `PrivacyPool__RelayerMismatch()`', async () => {
                const withdrawData = await generateWithdrawData(0, fix);
                await expect(
                    privacyPool.connect(signers[0]).withdraw({
                        proof: withdrawData.proof,
                        feeReceiver: withdrawData.feeReceiver,
                    }, {
                        value: withdrawData.proof.refund,
                    })
                ).to.be.revertedWithCustomError(
                    privacyPool,
                    'PrivacyPool__RelayerMismatch',
                );
            }).timeout(WITHDRAWALS_TIMEOUT);
        });

        describe("withdrawals with hacker-filled blocklist; good signers can use it; bad signers can't", () => {
            it(`should process good withdrawals using the hacker block list`, async () => {
                for (const i of withdrawalOrder) {
                    // we're still doing random order, just skipping the bad signers
                    if (i >= goodSigners.length) continue;
                    const withdrawData = await generateWithdrawData(i, fix, {}, ACCESS_LIST_TYPE.Hacker);

                    // verify proof using contract verifier
                    await expect(privacyPool.verifyWithdrawal(withdrawData.proof)).to.not.be.reverted;

                    const tx = await privacyPool.connect(relayer).withdraw({
                        proof: withdrawData.proof,
                        feeReceiver: withdrawData.feeReceiver,
                    }, {
                        value: withdrawData.proof.refund,
                    });
                    await verifyWithdrawal(
                        tx,
                        privacyPool,
                        denomination,
                        asset,
                        withdrawData.proof,
                        withdrawData.feeReceiver,
                        false
                    );
                }
            }).timeout(WITHDRAWALS_TIMEOUT);

            it(`should prevent bad withdrawals from using the hacker block list`, async () => {
                for (const i of withdrawalOrder) {
                    // we're still doing random order, just skipping the bad signers
                    if (i < goodSigners.length) continue;
                    // Expecting rejection with a specific WASM error message
                    await expect(generateWithdrawData(i, fix, {}, ACCESS_LIST_TYPE.Hacker))
                        .to.be.rejectedWith("Error in template WithdrawFromSubset_214 line: 116");
                }
            }).timeout(WITHDRAWALS_TIMEOUT);
        });
    });
});
