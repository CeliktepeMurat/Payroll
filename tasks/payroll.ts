import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment, TaskArguments } from "hardhat/types";

import { Payroll } from "../types";
import { createInstance } from "./instance";

task("add-employee", "Add an employee to the Payroll contract")
  .addParam("contract", "The address of the Payroll contract")
  .addParam("employee", "The address of the employee to add")
  .setAction(async ({ contract, employee }, hre) => {
    try {
      const { ethers } = hre;
      const [signer] = await ethers.getSigners();

      console.info("👑 Using owner signer:", await signer.getAddress());
      console.info("📍 Payroll contract:", contract);
      console.info("👤 Adding employee:", employee);

      const payroll = await ethers.getContractAt("Payroll", contract, signer);

      const tx = await payroll.addEmployee(employee);
      const receipt = await tx.wait();

      console.info("✅ Employee added successfully!");
      console.info("Transaction hash:", receipt?.hash);
    } catch (error) {
      console.error("❌ Failed to add employee:", error);
    }
  });

task("set-salary", "Set the salary of an employee")
  .addParam("contract", "The address of the contract")
  .addParam("employee", "The address of the employee")
  .addParam("amount", "The salary amount")
  .setAction(
    async (
      { contract, employee, amount }: TaskArguments,
      hre: HardhatRuntimeEnvironment,
    ) => {
      try {
        const { ethers } = hre;

        const [signer] = await hre.ethers.getSigners();
        const signerAddress = await signer.getAddress();

        console.info("🔐 Using signer:", signerAddress);
        console.info("📍 Contract:", contract);
        console.info("👤 Employee:", employee);
        console.info("💰 Salary:", amount);

        console.info("🔄 Initializing FHEVM...");
        const instance = await createInstance(hre);

        console.info("🔐 Encrypting salary amount...");
        const input = instance.createEncryptedInput(contract, signerAddress);
        input.add64(amount * 10 ** 6);
        const encryptedInput = await input.encrypt();

        console.info("📄 Getting Payroll contract...");
        const payroll = (await ethers.getContractAt(
          "Payroll",
          contract,
          signer,
        )) as Payroll;

        console.info("🚀 Sending transaction...");
        const tx = await payroll.setSalary(
          employee,
          encryptedInput.handles[0],
          encryptedInput.inputProof,
        );

        console.info("⏳ Waiting for confirmation...");
        const receipt = await tx.wait();

        console.info("----------------------------------------");
        console.info("✅ Salary set successfully!");
        console.info("Transaction hash:", receipt!.hash);
        console.info("----------------------------------------");
      } catch (error) {
        console.error("❌ Set salary failed:");
        console.error(error instanceof Error ? error.message : error);
        throw error;
      }
    },
  );

task("withdraw-salary", "Withdraw salary from Payroll contract")
  .addParam("contract", "The address of the deployed Payroll contract")
  .addParam("privkey", "The private key of the employee who wants to withdraw")
  .setAction(async ({ contract, privkey }, hre) => {
    try {
      const { ethers } = hre;

      const provider = ethers.provider;
      const signer = new ethers.Wallet(privkey, provider);
      const signerAddress = await signer.getAddress();

      console.info("🔐 Using signer:", signerAddress);
      console.info("📍 Payroll Contract:", contract);

      const payroll = await ethers.getContractAt("Payroll", contract, signer);

      console.info("💸 Withdrawing salary...");
      const tx = await payroll.withdrawSalary();

      console.info("⏳ Waiting for confirmation...");
      const receipt = await tx.wait();

      console.info("----------------------------------------");
      console.info("✅ Salary withdrawn successfully!");
      console.info("Transaction hash:", receipt!.hash);
      console.info("----------------------------------------");
    } catch (error) {
      console.error("❌ Failed to withdraw salary:");
      console.error(error instanceof Error ? error.message : error);
      throw error;
    }
  });

task("transfer-ctokens", "Transfer encrypted tokens to the Payroll contract")
  .addParam("token", "The address of the Confidential Token contract")
  .addParam("to", "The recipient address (Payroll contract)")
  .addParam("amount", "Amount in full tokens (will be scaled)")
  .setAction(async ({ token, to, amount }, hre) => {
    try {
      const { ethers } = hre;
      const [signer] = await ethers.getSigners();

      console.info("🔐 Using signer:", await signer.getAddress());
      console.info("📍 Token:", token);
      console.info("📍 To:", to);
      console.info("💰 Amount:", amount);

      const instance = await createInstance(hre);

      console.info("🔐 Encrypting amount...");
      const input = instance.createEncryptedInput(
        token,
        await signer.getAddress(),
      );
      input.add64(amount * 10 ** 6);
      const encrypted = await input.encrypt();

      const cToken = await ethers.getContractAt(
        "IConfidentialERC20",
        token,
        signer,
      );

      console.info("🚀 Transferring confidential tokens...");

      const tx = await cToken["transfer(address,bytes32,bytes)"](
        to,
        encrypted.handles[0],
        encrypted.inputProof,
      );
      const receipt = await tx.wait();

      console.info("✅ Encrypted token transfer complete!");
      console.info("Transaction hash:", receipt!.hash);
    } catch (err) {
      console.error("❌ Transfer failed:", err);
      throw err;
    }
  });

task(
  "unwrap-ctokens",
  "Unwrap confidential tokens into underlying ERC20 tokens",
)
  .addParam("wrapper", "Address of the Confidential Token Wrapper contract")
  .addParam("privkey", "The private key of the employee")
  .setAction(async ({ wrapper, privkey }, hre) => {
    try {
      const { ethers } = hre;

      const provider = ethers.provider;
      const signer = new ethers.Wallet(privkey, provider);
      const signerAddress = await signer.getAddress();

      console.info("🔐 Using signer:", signerAddress);
      console.info("📍 Wrapper Contract:", wrapper);

      const wrapperContract = await ethers.getContractAt(
        "ConfidentialERC20Wrapped",
        wrapper,
        signer,
      );

      console.info("🔓 Decrypted balance:", 2000 * 10 ** 6);

      // Call unwrap
      console.info("💥 Sending unwrap transaction...");
      const tx = await wrapperContract.unwrap(1999998000);
      const receipt = await tx.wait();

      console.info("✅ Unwrap transaction confirmed!");
      console.info("Transaction hash:", receipt!.hash);
    } catch (err) {
      console.error("❌ Unwrap failed:", err);
      throw err;
    }
  });
