const { expect } = require("chai")
const { ethers } = require("hardhat")
const { poseidonContract } = require("circomlibjs")
const { deploy, deployBytes } = require("../scripts/hardhat.utils")
const { setStorageAt } = require("@nomicfoundation/hardhat-network-helpers")

const anyNonZeroAddress = (i) => {
    if (!ethers.utils.isAddress(i)) {
        throw new Chai.AssertionError(
            `anyNonZeroAddress expected its argument to be an address, but it was ${i}`
        );
    };
    if (i === ethers.constants.AddressZero) {
        throw new Chai.AssertionError(
            `anyNonZeroAddress expected its argument to be a nonzero address, but it was ${i}`
        );
    };
    return true
}

describe("PrivacyPoolFactory.sol", function () {
    before(async () => {
        this.signers = await ethers.getSigners();

        // poseidon hash function evm contract
        const abi = poseidonContract.generateABI(2);
        const bytecode = poseidonContract.createCode(2);
        this.poseidonContract = await deployBytes(
            "Poseidon",
            abi,
            bytecode
        );

        // 1 ETH pool
        this.power = 18;
        this.denomination = ethers.utils.parseUnits("1", this.power);

        // deploy the Privacy pool factory
        this.privacyPoolFactory = await deploy(
            "PrivacyPoolFactory",
            [this.poseidonContract.address]
        );
        this.asset = await this.privacyPoolFactory.NATIVE()
    });

    it("creates a new PrivacyTokenPool and emits the event", async () => {
        await expect(this.privacyPoolFactory.createPool(this.asset, this.power))
            .to.emit(this.privacyPoolFactory, 'PrivacyPoolCreated')
            .withArgs(anyNonZeroAddress, this.asset, this.denomination);

        const pool = await this.privacyPoolFactory.poolGroups(this.asset, this.power, 0);
        await expect(this.privacyPoolFactory.provider.getCode(pool))
            .eventually.not.to.be.equal('0x');

        await expect(this.privacyPoolFactory.poolGroupByInput(this.asset, this.power)).to.not.be.reverted;
    });
    it('can handle erc20 tokens as well', async () => {
        const asset = await deploy("Token", [ethers.utils.parseEther("1")]);
        await expect(this.privacyPoolFactory.createPool(asset.address, this.power))
            .to.emit(this.privacyPoolFactory, 'PrivacyPoolCreated')
            .withArgs(anyNonZeroAddress, asset.address, this.denomination);
    })

    it("cannot create a next pool until the current pool deposit tree limit is reached", async () => {
        await expect(this.privacyPoolFactory.createPool(this.asset, this.power))
            .to.be.revertedWithCustomError(
                this.privacyPoolFactory,
                "PreviousPoolTreeLimitNotReached"
            );
    });

    it("creates a next pool if the current pool deposit tree limit is reached", async () => {
        const pool = await this.privacyPoolFactory.poolGroups(this.asset, this.power, 0);
        /*
            simulate a full tree by setting the `currentLeafIndex` variable using hardhat
            (it would take too long to compute 1048576 insertions in a hardhat test). the slot was
            found using `hardhat-storage-layout` and running the command `hardhat compile && hardhat check`.
        */
        await setStorageAt(
            pool,
            1,
            1048576 // 2 ** 20
        );

        await expect(this.privacyPoolFactory.createPool(this.asset, this.power))
            .to.emit(this.privacyPoolFactory, 'PrivacyPoolCreated')
            .withArgs(anyNonZeroAddress, this.asset, this.denomination);

        const pool2 = await this.privacyPoolFactory.poolGroups(this.asset, this.power, 1);
        await expect(this.privacyPoolFactory.provider.getCode(pool2))
            .eventually.not.to.be.equal('0x');

        expect(await this.privacyPoolFactory.poolGroupLength(this.asset, this.power)).to.equal(ethers.BigNumber.from(2));
    });

    it('should revert with `PoolInputNotAllowed`', async () => {
        // with power over 77
        await expect(this.privacyPoolFactory.createPool(this.asset, 78))
            .to.be.revertedWithCustomError(
                this.privacyPoolFactory,
                "PoolInputNotAllowed"
            );

        // with asset that has totalSupply = 0
        const asset = await deploy("Token", [ethers.utils.parseEther("0")]);
        await expect(this.privacyPoolFactory.createPool(asset.address, this.power))
            .to.be.revertedWithCustomError(
                this.privacyPoolFactory,
                "PoolInputNotAllowed"
            );
    });
})
