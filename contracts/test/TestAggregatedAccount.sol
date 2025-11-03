// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

import "../samples/SimpleAccount.sol";
import "../core/Helpers.sol";

/**
 * @title TestAggregatedAccount
 * @notice Aggregated-signature test account.
 * @dev Works only with TestAggregatedSignature, which doesn't actually verify a signature,
 *      but instead checks the nonce sum. A real aggregated account should expose data
 *      (e.g., its public key) to the aggregator.
 */
contract TestAggregatedAccount is SimpleAccount {
    /// @notice Address of the aggregator contract used in tests.
    address public immutable aggregator;

    /**
     * @notice The constructor is used only for the implementation and sets immutable values.
     * @dev Mutable storage for proxy instances is set via {initialize}.
     * @param anEntryPoint The EntryPoint contract.
     * @param anAggregator The aggregator used for tests.
     */
    constructor(IEntryPoint anEntryPoint, address anAggregator) SimpleAccount(anEntryPoint) {
        aggregator = anAggregator;
    }

    /// @inheritdoc SimpleAccount
    function initialize(address) public virtual override initializer {
        // Intentionally set owner to address(0) for the aggregated-signature test account.
        super._initialize(address(0));
    }

    /**
     * @inheritdoc SimpleAccount
     * @dev Returns validation data that points to the aggregator. This test implementation
     *      ignores the signature entirely.
     */
    function _validateSignature(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash
    )
        internal
        view
        override
        returns (uint256 validationData)
    {
        // Silence unused variable warnings; this test implementation doesn't inspect them.
        (userOp, userOpHash);
        return _packValidationData(ValidationData(aggregator, 0, 0));
    }
}
