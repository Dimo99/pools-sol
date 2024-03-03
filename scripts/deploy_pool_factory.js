const fs = require("fs");
const { poseidonContract } = require("circomlibjs");
const { deploy, deployBytes } = require("./hardhat.utils.js");
const poseidonContracts = require("../poseidonContracts.json");

const nativePower = 15; // 0.001 ETH

async function main() {
    hre.ethers.provider.getNetwork().then(async ({ chainId }) => {
        const poseidonAddress = poseidonContracts[chainId];
        if (!poseidonAddress) {
            const abi = poseidonContract.generateABI(2);
            const bytecode = poseidonContract.createCode(2);
            const poseidon = await deployBytes("Poseidon", abi, bytecode, true);
            poseidonContracts[chainId] = poseidon.address;
            fs.writeFileSync(
                "./poseidonContracts.json",
                JSON.stringify(poseidonContracts, null, 4)
            );
        }

        console.log(`Deploying PrivacyPoolFactory contract`)
        const privacyPoolFactory = await deploy(
            "PrivacyPoolFactory",
            [poseidonContracts[chainId]],
            true
        );
        let txReceipt = await hre.ethers.provider.getTransactionReceipt(privacyPoolFactory.deployTransaction.hash);
        console.log(`Deployed at ${txReceipt.blockNumber}\n`)

        const nativeAddress = await privacyPoolFactory.NATIVE()
        const tx1 = await privacyPoolFactory.createPool(nativeAddress, nativePower)
        await tx1.wait()
        console.log(`Pool added: ${tx1.hash}\n`)
    });
}

main().catch(console.error);
