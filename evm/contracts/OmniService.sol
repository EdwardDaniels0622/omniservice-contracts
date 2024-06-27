// SPDX-License-Identifier: MIT

pragma solidity 0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@mapprotocol/protocol/contracts/interface/ILightNode.sol";
import "@mapprotocol/protocol/contracts/utils/Utils.sol";
import "@mapprotocol/protocol/contracts/lib/LogDecoder.sol";
import "./interface/IFeeService.sol";
import "./interface/IMOSV3.sol";
import "./interface/IMapoExecutor.sol";
import "./utils/EvmDecoder.sol";
import "./abstract/OmniServiceCore.sol";

contract OmniService is OmniServiceCore {
    using SafeMathUpgradeable for uint;
    using AddressUpgradeable for address;

    uint256 public relayChainId;
    address public relayContract;
    ILightNode public lightNode;

    event SetLightClient(address indexed lightNode);
    event SetRelayContract(uint256 indexed chainId, address indexed relay);

    event MessageVerified(
        uint256 indexed fromChain,
        uint256 indexed toChain,
        bytes32 orderId,
        bytes fromAddrss,
        bytes messageData
    );

    function setLightClient(address _lightNode) external onlyOwner checkAddress(_lightNode) {
        lightNode = ILightNode(_lightNode);
        emit SetLightClient(_lightNode);
    }

    function setRelayContract(uint256 _chainId, address _relay) external onlyOwner checkAddress(_relay) {
        relayContract = _relay;
        relayChainId = _chainId;
        emit SetRelayContract(_chainId, _relay);
    }

    function getOrderStatus(
        uint256,
        uint256 _blockNum,
        bytes32 _orderId
    ) external view virtual override returns (bool exists, bool verifiable, uint256 nodeType) {
        exists = orderList[_orderId];
        verifiable = lightNode.isVerifiable(_blockNum, bytes32(""));
        nodeType = lightNode.nodeType();
    }

    function transferOut(
        uint256 _toChain,
        bytes memory _messageData,
        address _feeToken
    ) external payable virtual override whenNotPaused returns (bytes32) {
        bytes32 orderId = _transferOut(_toChain, _messageData, _feeToken);

        _notifyLightClient(bytes(""));

        return orderId;
    }

    function messageOut(
        bytes32 _transferId,
        address _initiator, // initiator address
        address _referrer,
        uint256 _toChain,
        bytes memory _messageData,
        address _feeToken
    ) external payable virtual whenNotPaused returns (bytes32) {
        bytes32 orderId = _transferOut(_toChain, _messageData, _feeToken);

        _notifyLightClient(bytes(""));

        return orderId;
    }

    function transferInWithIndex(
        uint256 _chainId,
        uint256 _logIndex,
        bytes memory _receiptProof
    ) external virtual override nonReentrant whenNotPaused {
        IEvent.dataOutEvent memory outEvent = _transferIn(_chainId, _logIndex, _receiptProof);

        MessageData memory msgData = abi.decode(outEvent.messageData, (MessageData));
        _messageIn(outEvent, msgData);
    }

    function transferInVerify(
        uint256 _chainId,
        uint256 _logIndex,
        bytes memory _receiptProof
    ) external virtual nonReentrant whenNotPaused {
        IEvent.dataOutEvent memory outEvent = _transferIn(_chainId, _logIndex, _receiptProof);

        storedCalldataList[outEvent.orderId] = keccak256(
            abi.encodePacked(outEvent.fromChain, outEvent.fromAddress, outEvent.messageData)
        );

        emit MessageVerified(
            outEvent.fromChain,
            outEvent.toChain,
            outEvent.orderId,
            outEvent.fromAddress,
            outEvent.messageData
        );
    }

    function transferInVerified(
        bytes32 _orderId,
        uint256 _fromChain,
        bytes calldata _fromAddress,
        bytes calldata _messageData
    ) external virtual checkOrder(_orderId) nonReentrant whenNotPaused {
        require(
            keccak256(abi.encodePacked(_fromChain, _fromAddress, _messageData)) == storedCalldataList[_orderId],
            "MOSV3: invalid messageData"
        );
        IEvent.dataOutEvent memory outEvent = IEvent.dataOutEvent({
            orderId: _orderId,
            fromChain: _fromChain,
            toChain: selfChainId,
            fromAddress: _fromAddress,
            messageData: _messageData
        });
        delete storedCalldataList[_orderId];
        MessageData memory msgData = abi.decode(_messageData, (MessageData));
        _messageIn(outEvent, msgData);
    }

    function retryMessageIn(
        uint256 _fromChain,
        bytes32 _orderId,
        bytes calldata _fromAddress,
        bytes calldata _messageData
    ) external virtual override nonReentrant whenNotPaused {
        require(
            keccak256(abi.encodePacked(_fromChain, _fromAddress, _messageData)) == storedCalldataList[_orderId],
            "MOSV3: error messageDate"
        );
        IEvent.dataOutEvent memory outEvent = IEvent.dataOutEvent({
            orderId: _orderId,
            fromChain: _fromChain,
            toChain: uint256(selfChainId),
            fromAddress: _fromAddress,
            messageData: _messageData
        });
        delete storedCalldataList[_orderId];
        MessageData memory msgData = abi.decode(_messageData, (MessageData));
        _retryMessageIn(outEvent, msgData);
    }

    function _transferIn(
        uint256 _chainId,
        uint256 _logIndex,
        bytes memory _receiptProof
    ) internal returns (IEvent.dataOutEvent memory outEvent) {
        require(_chainId == relayChainId, "MOSV3: Invalid chain id");
        (bool success, string memory message, bytes memory logArray) = lightNode.verifyProofDataWithCache(
            _receiptProof
        );
        require(success, message);

        LogDecoder.txLog memory log = LogDecoder.decodeTxLog(logArray, _logIndex);
        require(relayContract == log.addr, "MOSV3: Invalid relay");

        bytes32 topic = abi.decode(log.topics[0], (bytes32));
        require(topic == EvmDecoder.MAP_MESSAGE_TOPIC, "MOSV3: Invalid topic");

        (, outEvent) = EvmDecoder.decodeDataLog(log);
        require(outEvent.toChain == selfChainId, "MOSV3: Invalid target chain id");
    }

    function _notifyLightClient(bytes memory _data) internal {
        lightNode.notifyLightClient(address(this), _data);
    }
}
