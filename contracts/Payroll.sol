// SPDX-License-Identifier: BSD-3-Clause-Clear

pragma solidity ^0.8.24;
import "fhevm/lib/TFHE.sol";
import "fhevm/gateway/GatewayCaller.sol";
import { SepoliaZamaFHEVMConfig } from "fhevm/config/ZamaFHEVMConfig.sol";
import { SepoliaZamaGatewayConfig } from "fhevm/config/ZamaGatewayConfig.sol";
import {
    IConfidentialERC20
} from "fhevm-contracts/contracts/token/ERC20/IConfidentialERC20.sol";

contract Payroll is
    SepoliaZamaFHEVMConfig,
    SepoliaZamaGatewayConfig,
    GatewayCaller
{
    address public owner;
    IConfidentialERC20 public cPaymentToken;

    mapping(address => bool) public isEmployee;
    mapping(address => euint64) public encryptedSalaries;
    mapping(address => uint64) public lastWithdrawTime;

    constructor(address _cPaymentToken) {
        if (_cPaymentToken == address(0)) {
            revert NoPaymentToken();
        }

        owner = msg.sender;
        cPaymentToken = IConfidentialERC20(_cPaymentToken);
    }

    error NotContractOwner();
    error AlreadyRegistered();
    error InvalidEmployee();
    error NoPaymentToken();
    error CooldownNotMet();

    modifier onlyOwner() {
        if (msg.sender != owner) {
            revert NotContractOwner();
        }
        _;
    }

    function addEmployee(address employee) external onlyOwner {
        if (isEmployee[employee]) {
            revert AlreadyRegistered();
        }
        isEmployee[employee] = true;
    }

    function removeEmployee(address employee) external onlyOwner {
        if (!isEmployee[employee]) {
            revert InvalidEmployee();
        }
        isEmployee[employee] = false;
    }

    function setSalary(
        address employee,
        einput encryptedSalary,
        bytes calldata inputProof
    ) external onlyOwner {
        if (!isEmployee[employee]) {
            revert InvalidEmployee();
        }

        euint64 encrypted = TFHE.asEuint64(encryptedSalary, inputProof);
        encryptedSalaries[employee] = encrypted;

        TFHE.allow(encrypted, employee);
        TFHE.allowThis(encrypted);
    }

    function withdrawSalary() external {
        if (!isEmployee[msg.sender]) {
            revert InvalidEmployee();
        }

        uint64 lastWithdraw = lastWithdrawTime[msg.sender];
        if (block.timestamp < lastWithdraw + 30 days) {
            revert CooldownNotMet();
        }

        euint64 salary = encryptedSalaries[msg.sender];

        TFHE.allow(salary, address(cPaymentToken));

        // Update the last withdraw time
        lastWithdrawTime[msg.sender] = uint64(block.timestamp);

        // Transfer the salary
        cPaymentToken.transfer(msg.sender, salary);
    }
}
