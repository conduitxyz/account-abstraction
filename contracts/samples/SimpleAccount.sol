// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

/* solhint-disable avoid-low-level-calls */
/* solhint-disable no-inline-assembly */
/* solhint-disable reason-string */

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import "../core/BaseAccount.sol";
import "../core/Helpers.sol";
import "./callback/TokenCallbackHandler.sol";

/**
 * @title SimpleAccount
 * @notice Minimal sample account contract.
 * - Supports execute and ETH handling methods.
 * - Has a single owner that can send requests through the EntryPoint.
 */
contract SimpleAccount is BaseAccount, TokenCallbackHandler, UUPSUpgradeable, Initializable {
    address public owner;

    IEntryPoint private immutable _entryPoint;

    event SimpleAccountInitialized(IEntryPoint indexed entryPoint, address indexed owner);

    modifier onlyOwner() {
        _onlyOwner();
        _;
    }

    /// @inheritdoc BaseAccount
    function entryPoint() public view virtual override returns (IEntryPoint) {
        return _entryPoint;
    }

    // Accept ETH transfers
    receive() external payable {}

    /**
     * @dev The EntryPoint is immutable to reduce gas.
     * To upgrade the EntryPoint, deploy a new implementation that points
     * to the new EntryPoint and then upgrade via `upgradeTo()`.
     */
    constructor(IEntryPoint anEntryPoint) {
        _entryPoint = anEntryPoint;
        _disableInitializers();
    }

    function _onlyOwner() internal view {
        // Directly from the EOA owner, or via the account itself (e.g., through execute()).
        require(msg.sender == owner || msg.sender == address(this), "only owner");
    }

    /**
     * @notice Execute a transaction (callable by the owner or EntryPoint).
     * @param dest Destination address to call.
     * @param value ETH value to send with the call.
     * @param func Calldata for the call.
     */
    function execute(address dest, uint256 value, bytes calldata func) external {
        _requireFromEntryPointOrOwner();
        _call(dest, value, func);
    }

    /**
     * @notice Execute a sequence of transactions.
     * @dev To reduce gas for the trivial case (no value), pass a zero-length `value` array
     *      to indicate all calls should use zero value.
     * @param dest Array of destination addresses.
     * @param value Array of ETH values to send with each call. May be zero-length for no-value calls.
     * @param func Array of calldatas for each call.
     */
    function executeBatch(address[] calldata dest, uint256[] calldata value, bytes[] calldata func) external {
        _requireFromEntryPointOrOwner();
        require(dest.length == func.length && (value.length == 0 || value.length == func.length), "wrong array lengths");
        if (value.length == 0) {
            for (uint256 i = 0; i < dest.length; i++) {
                _call(dest[i], 0, func[i]);
            }
        } else {
            for (uint256 i = 0; i < dest.length; i++) {
                _call(dest[i], value[i], func[i]);
            }
        }
    }

    /**
     * @notice Initialize the account with an owner.
     * @param anOwner The owner (signer) of this account.
     */
    function initialize(address anOwner) public virtual initializer {
        _initialize(anOwner);
    }

    function _initialize(address anOwner) internal virtual {
        owner = anOwner;
        emit SimpleAccountInitialized(_entryPoint, owner);
    }

    /// @dev Require the call to come from the EntryPoint or the owner.
    function _requireFromEntryPointOrOwner() internal view {
        require(msg.sender == address(entryPoint()) || msg.sender == owner, "account: not Owner or EntryPoint");
    }

    /// @inheritdoc BaseAccount
    function _validateSignature(PackedUserOperation calldata userOp, bytes32 userOpHash)
        internal
        override
        virtual
        returns (uint256 validationData)
    {
        bytes32 hash = MessageHashUtils.toEthSignedMessageHash(userOpHash);
        if (owner != ECDSA.recover(hash, userOp.signature)) {
            return SIG_VALIDATION_FAILED;
        }
        return SIG_VALIDATION_SUCCESS;
    }

    function _call(address target, uint256 value, bytes memory data) internal {
        (bool success, bytes memory result) = target.call{value: value}(data);
        if (!success) {
            assembly {
                revert(add(result, 32), mload(result))
            }
        }
    }

    /**
     * @notice Get this account's deposit held in the EntryPoint.
     */
    function getDeposit() public view returns (uint256) {
        return entryPoint().balanceOf(address(this));
    }

    /**
     * @notice Deposit more funds for this account in the EntryPoint.
     */
    function addDeposit() public payable {
        entryPoint().depositTo{value: msg.value}(address(this));
    }

    /**
     * @notice Withdraw funds from this account's EntryPoint deposit.
     * @param withdrawAddress Target address to receive the withdrawn amount.
     * @param amount Amount to withdraw.
     */
    function withdrawDepositTo(address payable withdrawAddress, uint256 amount) public onlyOwner {
        entryPoint().withdrawTo(withdrawAddress, amount);
    }

    // UUPS authorization hook
    function _authorizeUpgrade(address newImplementation) internal override {
        // Silence compiler warning about unused variable without incurring overhead
        (newImplementation);
        _onlyOwner();
    }
}
