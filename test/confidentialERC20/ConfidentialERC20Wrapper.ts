import { ethers } from "hardhat";

import type { ConfidentialERC20Wrapped, TestToken } from "../../types";
import { getSigners, initSigners } from "../signers";

export async function deployConfidentialERC20WrapperFixture(): Promise<{
  token: TestToken;
  wrapper: ConfidentialERC20Wrapped;
}> {
  await initSigners();
  const signers = await getSigners();

  // Deploy mock ERC20 token
  const tokenFactory = await ethers.getContractFactory("TestToken");
  const token = await tokenFactory.connect(signers.alice).deploy();
  await token.waitForDeployment();

  // Deploy confidential wrapper with token address
  const wrapperFactory = await ethers.getContractFactory("MyConfidentialTokenWrapper");
  const wrapper = await wrapperFactory.connect(signers.alice).deploy(await token.getAddress());
  await wrapper.waitForDeployment();

  return { token, wrapper };
}
