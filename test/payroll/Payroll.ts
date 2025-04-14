/* eslint-disable @typescript-eslint/no-explicit-any */

/* eslint-disable @typescript-eslint/no-unused-expressions */
import { expect } from "chai";
import { Signer } from "ethers";
import { ethers, network } from "hardhat";

import { deployConfidentialERC20WrapperFixture } from "../confidentialERC20/ConfidentialERC20Wrapper";
import { createInstance } from "../instance";
import { reencryptEuint64 } from "../reencrypt";

describe("Payroll", function () {
  let owner: Signer;
  let employee: Signer;
  let nonEmployee: Signer;
  let payroll: any;
  let wrapperContract: any;
  let tokenContract: any;

  beforeEach(async () => {
    [owner, employee, nonEmployee] = await ethers.getSigners();

    const { token, wrapper } = await deployConfidentialERC20WrapperFixture();
    wrapperContract = wrapper;
    tokenContract = token;

    const PayrollFactory = await ethers.getContractFactory("Payroll");
    payroll = await PayrollFactory.connect(owner).deploy(
      await wrapper.getAddress(),
    );
    await payroll.waitForDeployment();
  });

  it("should allow owner to add employee", async () => {
    await payroll.connect(owner).addEmployee(employee.getAddress());
    const isEmployee = await payroll.isEmployee(employee.getAddress());
    expect(isEmployee).to.be.true;
  });

  it("should not allow non-owner to add employee", async () => {
    await expect(
      payroll.connect(employee).addEmployee(employee.getAddress()),
    ).to.be.revertedWithCustomError(payroll, "NotContractOwner");
  });

  it("should allow owner to remove an employee", async () => {
    await payroll.connect(owner).addEmployee(employee.getAddress());

    await payroll.connect(owner).removeEmployee(employee.getAddress());

    const isStillEmployee = await payroll.isEmployee(employee.getAddress());
    expect(isStillEmployee).to.be.false;
  });

  it("should not allow non-owner to remove an employee", async () => {
    await payroll.connect(owner).addEmployee(employee.getAddress());

    await expect(
      payroll.connect(employee).removeEmployee(employee.getAddress()),
    ).to.be.revertedWithCustomError(payroll, "NotContractOwner");
  });

  it("should allow owner to assign encrypted salary to employee", async () => {
    const employeeAddr = await employee.getAddress();
    await payroll.connect(owner).addEmployee(employeeAddr);

    const fhevm = await createInstance();
    const input = fhevm.createEncryptedInput(
      await payroll.getAddress(),
      await owner.getAddress(),
    );
    input.add64(5000);
    const encrypted = await input.encrypt();

    await payroll
      .connect(owner)
      .setSalary(employeeAddr, encrypted.handles[0], encrypted.inputProof);

    const encryptedSalary = await payroll.encryptedSalaries(employeeAddr);

    const decrypted = await reencryptEuint64(
      employee,
      fhevm,
      encryptedSalary,
      await payroll.getAddress(),
    );

    expect(decrypted).to.equal(5000);
  });

  it("should not allow non-owner to assign encrypted salary to employee", async () => {
    const employeeAddr = await employee.getAddress();
    await payroll.connect(owner).addEmployee(employeeAddr);

    const fhevm = await createInstance();
    const input = fhevm.createEncryptedInput(
      await payroll.getAddress(),
      await owner.getAddress(),
    );
    input.add64(5000);
    const encrypted = await input.encrypt();

    await expect(
      payroll
        .connect(employee)
        .setSalary(employeeAddr, encrypted.handles[0], encrypted.inputProof),
    ).to.be.revertedWithCustomError(payroll, "NotContractOwner");
  });

  it("should not allow non-employee to receive salary", async () => {
    const employeeAddr = await employee.getAddress();
    await payroll.connect(owner).addEmployee(employeeAddr);

    const fhevm = await createInstance();
    const input = fhevm.createEncryptedInput(
      await payroll.getAddress(),
      await owner.getAddress(),
    );
    input.add64(5000);
    const encrypted = await input.encrypt();

    await payroll
      .connect(owner)
      .setSalary(
        await employee.getAddress(),
        encrypted.handles[0],
        encrypted.inputProof,
      );

    await expect(
      payroll.connect(nonEmployee).withdrawSalary(),
    ).to.be.revertedWithCustomError(payroll, "InvalidEmployee");
  });

  it("should allow employee to withdraw salary", async () => {
    const amountToWrap = 10000;
    const salary = 2000;

    await tokenContract
      .connect(owner)
      .approve(await wrapperContract.getAddress(), amountToWrap * 10 ** 6);

    await wrapperContract.connect(owner).wrap(amountToWrap * 10 ** 6);

    const fhevm = await createInstance();
    const input = fhevm.createEncryptedInput(
      await wrapperContract.getAddress(),
      await owner.getAddress(),
    );
    input.add64(amountToWrap * 10 ** 6);
    const encrypted = await input.encrypt();

    await wrapperContract["transfer(address,bytes32,bytes)"](
      await payroll.getAddress(),
      encrypted.handles[0],
      encrypted.inputProof,
    );

    await payroll.connect(owner).addEmployee(await employee.getAddress());
    const salaryInput = fhevm.createEncryptedInput(
      await payroll.getAddress(),
      await owner.getAddress(),
    );
    salaryInput.add64(salary * 10 ** 6);
    const salaryEncrypted = await salaryInput.encrypt();
    await payroll
      .connect(owner)
      .setSalary(
        await employee.getAddress(),
        salaryEncrypted.handles[0],
        salaryEncrypted.inputProof,
      );

    await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 30]); // Increase time by 30 days
    await ethers.provider.send("evm_mine");

    await payroll.connect(employee).withdrawSalary();

    const encryptedBalance = await wrapperContract.balanceOf(
      await employee.getAddress(),
    );
    const decryptedBalance = await reencryptEuint64(
      employee,
      fhevm,
      encryptedBalance,
      await wrapperContract.getAddress(),
    );

    expect(decryptedBalance).to.equal(salary * 10 ** 6);

    // Check that the employee can unwrap the tokens
    const employeeBalance = await wrapperContract.balanceOf(
      await employee.getAddress(),
    );
    expect(employeeBalance).to.equal(encryptedBalance);

    // check employee balance for token contract
    const employeeTokenBalance = await tokenContract.balanceOf(
      await employee.getAddress(),
    );
    expect(employeeTokenBalance).to.equal(0);

    const tx = await wrapperContract.connect(employee).unwrap(decryptedBalance);
    const receipt = await tx.wait();

    const iface = new ethers.Interface([
      "event UnwrapRequested(uint256 requestId, address account, uint64 amount)",
    ]);

    const gatewayAddress = "0x33347831500f1e73f0cccbb95c9f86b94d7b1123";
    await network.provider.send("hardhat_setCode", [
      gatewayAddress,
      "0x60006000", // minimal STOP contract
    ]);
    await network.provider.send("hardhat_impersonateAccount", [gatewayAddress]);
    const gateway = await ethers.getSigner(gatewayAddress);

    await owner.sendTransaction({
      to: gatewayAddress,
      value: ethers.parseEther("1"),
    });

    let requestId: bigint | null = null;

    for (const log of receipt.logs) {
      if (
        log.address.toLowerCase() === wrapperContract.target.toLowerCase() // ensure this log is from your wrapper contract
      ) {
        const parsed = iface.parseLog(log);
        if (parsed?.name === "UnwrapRequested") {
          requestId = parsed.args.requestId;
          break;
        }
      }
    }

    await wrapperContract.connect(gateway).callbackUnwrap(requestId, true);
    await network.provider.send("hardhat_stopImpersonatingAccount", [
      gatewayAddress,
    ]);

    const employeeTokenBalanceAfter = await tokenContract.balanceOf(
      await employee.getAddress(),
    );

    expect(employeeTokenBalanceAfter).to.equal(salary * 10 ** 6);
  });

  it("should not allow employee to withdraw salary if not enough time has passed", async () => {
    const amountToWrap = 10000;
    const salary = 2000;

    await tokenContract
      .connect(owner)
      .approve(await wrapperContract.getAddress(), amountToWrap * 10 ** 6);

    await wrapperContract.connect(owner).wrap(amountToWrap * 10 ** 6);

    const fhevm = await createInstance();
    const input = fhevm.createEncryptedInput(
      await wrapperContract.getAddress(),
      await owner.getAddress(),
    );
    input.add64(amountToWrap * 10 ** 6);
    const encrypted = await input.encrypt();

    await wrapperContract["transfer(address,bytes32,bytes)"](
      await payroll.getAddress(),
      encrypted.handles[0],
      encrypted.inputProof,
    );

    await payroll.connect(owner).addEmployee(await employee.getAddress());

    const inputSalary = fhevm.createEncryptedInput(
      await payroll.getAddress(),
      await owner.getAddress(),
    );
    inputSalary.add64(salary * 10 ** 6);
    const encryptedInputSalary = await inputSalary.encrypt();

    await payroll
      .connect(owner)
      .setSalary(
        await employee.getAddress(),
        encryptedInputSalary.handles[0],
        encryptedInputSalary.inputProof,
      );

    // withdraw first time
    await payroll.connect(employee).withdrawSalary();
    const encryptedBalance = await wrapperContract.balanceOf(
      await employee.getAddress(),
    );
    const decryptedBalance = await reencryptEuint64(
      employee,
      fhevm,
      encryptedBalance,
      await wrapperContract.getAddress(),
    );
    expect(decryptedBalance).to.equal(salary * 10 ** 6);

    await expect(
      payroll.connect(employee).withdrawSalary(),
    ).to.be.revertedWithCustomError(payroll, "CooldownNotMet");
  });

  it("it should allow to withdraw if enough time has passed", async () => {
    const amountToWrap = 10000;
    const salary = 2000;

    await tokenContract
      .connect(owner)
      .approve(await wrapperContract.getAddress(), amountToWrap * 10 ** 6);

    await wrapperContract.connect(owner).wrap(amountToWrap * 10 ** 6);

    const fhevm = await createInstance();
    const input = fhevm.createEncryptedInput(
      await wrapperContract.getAddress(),
      await owner.getAddress(),
    );
    input.add64(amountToWrap * 10 ** 6);
    const encrypted = await input.encrypt();

    await wrapperContract["transfer(address,bytes32,bytes)"](
      await payroll.getAddress(),
      encrypted.handles[0],
      encrypted.inputProof,
    );

    await payroll.connect(owner).addEmployee(await employee.getAddress());

    const inputSalary = fhevm.createEncryptedInput(
      await payroll.getAddress(),
      await owner.getAddress(),
    );
    inputSalary.add64(salary * 10 ** 6);
    const encryptedInputSalary = await inputSalary.encrypt();

    await payroll
      .connect(owner)
      .setSalary(
        await employee.getAddress(),
        encryptedInputSalary.handles[0],
        encryptedInputSalary.inputProof,
      );

    // withdraw first time
    await payroll.connect(employee).withdrawSalary();

    // Increase time by 30 days
    await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 30]);
    await ethers.provider.send("evm_mine");

    // withdraw first time
    await payroll.connect(employee).withdrawSalary();
    const encryptedBalance = await wrapperContract.balanceOf(
      await employee.getAddress(),
    );
    const decryptedBalance = await reencryptEuint64(
      employee,
      fhevm,
      encryptedBalance,
      await wrapperContract.getAddress(),
    );
    expect(decryptedBalance).to.equal(salary * 2 * 10 ** 6);
  });
});
