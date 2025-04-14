import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployed = await deploy("Payroll", {
    from: deployer,
    args: ["0xd91c2753B0C5d85F96f99640DAd89d983c6b6166"],
    log: true,
  });

  console.log(`Payroll contract: `, deployed.address);
};
export default func;
func.id = "deploy_payrollContract"; // id required to prevent reexecution
func.tags = ["Payroll"];
