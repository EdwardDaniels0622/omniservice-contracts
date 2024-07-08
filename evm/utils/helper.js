let fs = require("fs");
let path = require("path");

let { Wallet } = require("zksync-web3");
let { Deployer } = require("@matterlabs/hardhat-zksync-deploy");

const TronWeb = require("tronweb");

DEPLOY_FACTORY = "0x6258e4d2950757A749a4d4683A7342261ce12471";
let IDeployFactory_abi = [
    "function deploy(bytes32 salt, bytes memory creationCode, uint256 value) external",
    "function getAddress(bytes32 salt) external view returns (address)",
];

async function contractCall(hre, contract, method, args, read) {
    let result;
    if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
        let methodFunc = contract.methods[method];
        if (read) {
            result = await methodFunc(args).call();
        } else {
            result = await methodFunc(args).send();
        }
    } else {
        let methodFunc = contract.funcs[method];
        result = await methodFunc(args);
    }

    return result;
}

async function create(hre, deployer, contract, paramTypes, args, salt) {
    // todo contract verify
    console.log(`deploy contract [${contract}] ...`);
    const { deploy } = hre.deployments;

    let contractAddr;
    if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
        contractAddr = await createTron(contract, args, hre.artifacts, hre.network.name);
    } else if (hre.network.zksync === true) {
        contractAddr = await createZk(contract, args, hre);
    } else if (salt != "") {
        let contractFactory = await ethers.getContractFactory(contract);
        let params = ethers.utils.defaultAbiCoder.encode(paramTypes, args);
        let createResult = await createFactory(salt, contractFactory.bytecode, params);
        if (!createResult[1]) {
            throw "deploy failed...";
        }
        contractAddr = createResult[0];
    } else {
        let impl = await deploy(contract, {
            from: deployer.address,
            args: args,
            log: true,
            contract: contract,
        });

        contractAddr = impl.address;
    }
    console.log(`deployed contract [${contract}] address: ${contractAddr}`);
    return contractAddr;
}

async function createFactory(salt, bytecode, param) {
    let [wallet] = await ethers.getSigners();
    let factory = await ethers.getContractAt(IDeployFactory_abi, DEPLOY_FACTORY, wallet);
    let salt_hash = await ethers.utils.keccak256(await ethers.utils.toUtf8Bytes(salt));
    // console.log("deploy factory address:", factory.address);
    console.log("deploy salt:", salt);
    let addr = await factory.getAddress(salt_hash);
    console.log("deployed to :", addr);
    let code = await ethers.provider.getCode(addr);
    let redeploy = false;
    if (code === "0x") {
        let create_code = ethers.utils.solidityPack(["bytes", "bytes"], [bytecode, param]);
        let create = await (await factory.deploy(salt_hash, create_code, 0)).wait();
        if (create.status == 1) {
            redeploy = true;
        } else {
            console.log("deploy fail");
            throw "deploy fail";
        }
    } else {
        throw "already deploy, please change the salt if if want to deploy another contract ...";
    }

    return [addr, redeploy];
}

async function createZk(contractName, args, hre) {
    const wallet = new Wallet(process.env.PRIVATE_KEY);
    const deployer = new Deployer(hre, wallet);
    const c_artifact = await deployer.loadArtifact(contractName);
    const c = await deployer.deploy(c_artifact, args);
    return c.address;
}

async function createTron(contractName, args, artifacts, network) {
    let c = await artifacts.readArtifact(contractName);
    let tronWeb = await getTronWeb(network);
    console.log("deploy address is:", tronWeb.defaultAddress);
    let contract_instance = await tronWeb.contract().new({
        abi: c.abi,
        bytecode: c.bytecode,
        feeLimit: 15000000000,
        callValue: 0,
        parameters: args,
    });
    let contract_address = tronWeb.address.fromHex(contract_instance.address);
    console.log(`${contractName} deployed on: ${contract_address} (${contract_instance.address})`);
    return "0x" + contract_instance.address.substring(2);
}

async function fromEvmAddress(hex, network) {
    let tronWeb = await getTronWeb(network);
    return tronWeb.address.fromHex(hex);
}

async function toEvmAddress(addr, network) {
    let tronWeb = await getTronWeb(network);
    return tronWeb.address.toHex(addr).replace(/^(41)/, "0x");
}

async function getTronContract(contractName, artifacts, network, addr) {
    let tronWeb = await getTronWeb(network);
    console.log("operator address is:", tronWeb.defaultAddress);
    let C = await artifacts.readArtifact(contractName);
    let c = await tronWeb.contract(C.abi, addr);
    return c;
}

async function getTronDeployer(hex, network) {
    let tronWeb = await getTronWeb(network);
    if (hex) {
        return tronWeb.defaultAddress.hex.replace(/^(41)/, "0x");
    } else {
        return tronWeb.defaultAddress;
    }
}

function isTron(chainId) {
    if (chainId === 728126428 || chainId === 3448148188) {
        return true;
    } else {
        return false;
    }
}

function isTestnet(chainId) {
    let testnets = [
        212,
        "Makalu",
        11155111,
        "Sepolia",
        97,
        "BscTest",
        300,
        "zkSyncTest",
        421614,
        "ArbitrumSepolia",
        53457,
        "DodoTest",
        11155420,
        "OpSepolia",
        80002,
        "Amoy",
        3448148188,
        "TronTest",
    ];
    return testnets.includes(chainId);
}

async function getTronWeb(network) {
    if (network === "Tron" || network === "TronTest") {
        if (network === "Tron") {
            return new TronWeb(
                "https://api.trongrid.io/",
                "https://api.trongrid.io/",
                "https://api.trongrid.io/",
                process.env.TRON_PRIVATE_KEY,
            );
        } else {
            return new TronWeb(
                "https://api.nileex.io/",
                "https://api.nileex.io/",
                "https://api.nileex.io/",
                process.env.TRON_PRIVATE_KEY,
            );
        }
    } else {
        throw "unsupport network";
    }
}

module.exports = {
    create,
    getTronWeb,
    getTronContract,
    getTronDeployer,
    isTestnet,
    isTron,
    fromEvmAddress,
    toEvmAddress,
};
