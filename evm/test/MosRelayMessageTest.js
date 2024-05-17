const {ethers,upgrades} = require("hardhat");
const {expect} = require("chai");
const {loadFixture} = require("@nomicfoundation/hardhat-network-helpers");


describe("MAPO ServiceRelayV3 start test", () =>{
    let owner;
    let addr1;

    let relay;
    let lightNode;
    let wrapped;
    let echo;
    let feeService;

    async function deployMosContractFixture() {
        [owner, addr1] = await ethers.getSigners();

        let relayContract = await ethers.getContractFactory("MapoServiceRelayV3");
        relay = await relayContract.deploy();
        console.log("mosMessageRelay address:",relay.address);

        let wrappedContract = await ethers.getContractFactory("Wrapped");
        wrapped = await wrappedContract.deploy();
        console.log("Relay Wrapped:",wrapped.address);

        let lightNodeContract = await ethers.getContractFactory("LightClientManager");
        lightNode = await  lightNodeContract.deploy();
        console.log("LightClientManager:",lightNode.address);

        let EchoContract = await ethers.getContractFactory("Echo");
        echo = await  EchoContract.deploy();
        console.log("echo relayOperation address:",echo.address)

        let data  = await relay.initialize(wrapped.address,lightNode.address);

        let proxyContract = await ethers.getContractFactory("MapoServiceProxyV3");
        let proxy = await proxyContract.deploy(relay.address,data.data);
        await proxy.deployed()
        relay = relayContract.attach(proxy.address);

        let feeContract = await ethers.getContractFactory("FeeService");
        feeService = await  feeContract.deploy();
        await feeService.initialize();
        console.log("FeeService Relay address:",feeService.address)

        return {relay,echo,feeService,owner,addr1};
    }

    describe("MapoServiceRelay start test",() =>{
        it('mosMessage relayOperation set ', async function () {

            let{relay,echo,feeService,owner,addr1} = await loadFixture(deployMosContractFixture)

            await relay.registerChain(5,"0x5FC8d32690cc91D4c39d9d3abcBD16989F875707","1");

            await relay.setFeeService(feeService.address);

            await echo.setWhiteList(relay.address);

            await echo.setMapoService(relay.address);

            await echo.addCorrespondence("5","0xcf7ed3acca5a467e9e704c703e8d87f634fb0fc9",true);
            await echo.addCorrespondence("5","0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",true);

            await feeService.setBaseGas(97,1000000);
            await feeService.setChainGasPrice(97,"0x0000000000000000000000000000000000000000",20000);

        });

        it('transferOut start test ', async function () {

            let data = await echo.getData("hello","hello world");

            //console.log(echo.address)
            let dataBytes = await echo.getMessageBytes([false,0,echo.address,data,"5000000","0"]);

            await relay.transferOut("97",dataBytes,"0x0000000000000000000000000000000000000000",{value:120000000000});

            await expect(relay.transferOut("212",dataBytes,"0x0000000000000000000000000000000000000000",{value:100})).to.be.revertedWith("MOSV3: Only other chain");


        });

        it('transferIn start test ', async function () {

            expect(await echo.EchoList("hello")).to.equal("");

            let receiptProof = "0xf90340f9033d945fc8d32690cc91d4c39d9d3abcbd16989f875707f863a0f4397fd41454e34a9a4015d05a670124ecd71fe7f1d05578a62f8009b1a57f8aa00000000000000000000000000000000000000000000000000000000000000005a000000000000000000000000000000000000000000000000000000000000000d4b902c0ea0e9099d25614e97dd388c2c303c43398c3be4b094fedccc0dbffb5022b0e4f000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000014cf7ed3acca5a467e9e704c703e8d87f634fb0fc900000000000000000000000000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c00000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000007a120000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000144ed7c70F96B99c776995fB64377f0d4aB3B0e1C100000000000000000000000000000000000000000000000000000000000000000000000000000000000000c4dd1d382400000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000000568656c6c6f000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000b68656c6c6f20776f726c6400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"

            await relay.transferIn(5,receiptProof);

            expect(await echo.EchoList("hello")).to.equal("hello world");

            //hello -> hello world bsc chain
            let receiptProof97 = "0xf90340f9033d945fc8d32690cc91d4c39d9d3abcbd16989f875707f863a0f4397fd41454e34a9a4015d05a670124ecd71fe7f1d05578a62f8009b1a57f8aa00000000000000000000000000000000000000000000000000000000000000005a00000000000000000000000000000000000000000000000000000000000000061b902c05a3f2576bd83e1e71fa12d735b7b6c65c2047948d2247959f8c5a9014fa6dd37000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000014cf7ed3acca5a467e9e704c703e8d87f634fb0fc900000000000000000000000000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c00000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000007a120000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000144ed7c70F96B99c776995fB64377f0d4aB3B0e1C100000000000000000000000000000000000000000000000000000000000000000000000000000000000000c4dd1d382400000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000000568656c6c6f000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000b68656c6c6f20776f726c6400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"

            await relay.transferIn(5,receiptProof97);

            expect(await echo.EchoList("hello")).to.equal("hello world");

            let receiptProofMessage = "0xf90340f9033d945fc8d32690cc91d4c39d9d3abcbd16989f875707f863a0f4397fd41454e34a9a4015d05a670124ecd71fe7f1d05578a62f8009b1a57f8aa00000000000000000000000000000000000000000000000000000000000000005a000000000000000000000000000000000000000000000000000000000000000d4b902c02bae61bbbef4162262e49119826a2bec3bbdda3f632b310037bb363844052303000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000014f39fd6e51aad88f6f4ce6ab8827279cfffb92266000000000000000000000000000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000004c4b40000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000144ed7c70F96B99c776995fB64377f0d4aB3B0e1C100000000000000000000000000000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000000568656c6c6f000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001368656c6c6f20776f726c64206d65737361676500000000000000000000000000"

            await relay.transferIn(5,receiptProofMessage);

            expect(await echo.EchoList("hello")).to.equal("hello world message");

        });

        it('test relayOperation is true', async function () {

            let receiptRelayProof = "0xf90340f9033d945fc8d32690cc91d4c39d9d3abcbd16989f875707f863a0f4397fd41454e34a9a4015d05a670124ecd71fe7f1d05578a62f8009b1a57f8aa00000000000000000000000000000000000000000000000000000000000000005a00000000000000000000000000000000000000000000000000000000000000061b902c0130be85df88b4c41c0211b6aa0f06f19a0cd9150d46ffad5f90932c7bb3e1ac2000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000014f39fd6e51aad88f6f4ce6ab8827279cfffb92266000000000000000000000000000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000004c4b40000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000144ed7c70F96B99c776995fB64377f0d4aB3B0e1C100000000000000000000000000000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000000568656c6c6f00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000086d6170576f726c64000000000000000000000000000000000000000000000000"

            let relayData = await relay.transferIn(5,receiptRelayProof);

            let relayHashData = await ethers.provider.getTransactionReceipt(relayData.hash);

            let decodeData = await ethers.utils.defaultAbiCoder.decode(["bytes32", "bytes", "bytes"],relayHashData.logs[0].data);


            let decodeProof = await ethers.utils.defaultAbiCoder.decode(["string","string"],decodeData[2]);


            expect(decodeProof[0]).to.equal("hello-Target-address");

            expect(await echo.EchoList("hello")).to.equal("mapWorld");

            let relayCallDataProof = "0xf90360f9035d945fc8d32690cc91d4c39d9d3abcbd16989f875707f863a0f4397fd41454e34a9a4015d05a670124ecd71fe7f1d05578a62f8009b1a57f8aa00000000000000000000000000000000000000000000000000000000000000005a00000000000000000000000000000000000000000000000000000000000000061b902e0b6ea9ac9699d385fdb72c9c9416d03b146675437714f6e5da2e8e4bf192efe38000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000014f39fd6e51aad88f6f4ce6ab8827279cfffb92266000000000000000000000000000000000000000000000000000000000000000000000000000000000000022000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000004c4b40000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000144ed7c70F96B99c776995fB64377f0d4aB3B0e1C100000000000000000000000000000000000000000000000000000000000000000000000000000000000000c4b162b7fb00000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000000568656c6c6f00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000096f70656e576f726c64000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"

            let relayCallTransaction = await relay.transferIn(5,relayCallDataProof);

            let callDataHash = await ethers.provider.getTransactionReceipt(relayCallTransaction.hash);

            let callDataReceipt = await ethers.utils.defaultAbiCoder.decode(["bytes32", "bytes", "bytes"],callDataHash.logs[0].data);

            let newCallData = await ethers.utils.defaultAbiCoder.decode(["string","string"],callDataReceipt[2]);

            expect(newCallData[1]).to.equal("hellCallData");

            expect(await echo.EchoList("hello")).to.equal("openWorld");
        });
    })



})




