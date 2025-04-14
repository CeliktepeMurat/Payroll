// SPDX-License-Identifier: BSD-3-Clause-Clear

pragma solidity ^0.8.24;
import "fhevm/lib/TFHE.sol";
import "fhevm/gateway/GatewayCaller.sol";
import { SepoliaZamaFHEVMConfig } from "fhevm/config/ZamaFHEVMConfig.sol";
import { SepoliaZamaGatewayConfig } from "fhevm/config/ZamaGatewayConfig.sol";
import {
    ConfidentialERC20Wrapped
} from "fhevm-contracts/contracts/token/ERC20/ConfidentialERC20Wrapped.sol";

contract MyConfidentialTokenWrapper is
    SepoliaZamaFHEVMConfig,
    SepoliaZamaGatewayConfig,
    GatewayCaller,
    ConfidentialERC20Wrapped
{
    event UnwrapRequested(uint256 requestId, address account, uint64 amount);
    constructor(
        address _tokenAddress
    ) ConfidentialERC20Wrapped(_tokenAddress, 300) {}

    function unwrap(uint64 amount) public virtual override {
        _canTransferOrUnwrap(msg.sender);

        isAccountRestricted[msg.sender] = true;

        ebool canUnwrap = TFHE.le(amount, _balances[msg.sender]);

        uint256[] memory cts = new uint256[](1);
        cts[0] = Gateway.toUint256(canUnwrap);

        uint256 requestId = Gateway.requestDecryption(
            cts,
            this.callbackUnwrap.selector,
            0,
            block.timestamp + 100,
            false
        );

        unwrapRequests[requestId] = UnwrapRequest({
            account: msg.sender,
            amount: amount
        });

        emit UnwrapRequested(requestId, msg.sender, amount);
    }
}
