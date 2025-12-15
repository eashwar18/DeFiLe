import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;

describe("DeFiLe", function () {
  let defile;
  let owner;
  let user1;
  let user2;
  let addrs;

  beforeEach(async function () {
    [owner, user1, user2, ...addrs] = await ethers.getSigners();
    
    const DeFiLe = await ethers.getContractFactory("DeFiLe");
    defile = await DeFiLe.deploy();
    await defile.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await defile.owner()).to.equal(owner.address);
    });

    it("Should start with zero total deposits", async function () {
      expect(await defile.totalDeposits()).to.equal(0);
    });

    it("Should start with zero total borrowed", async function () {
      expect(await defile.totalBorrowed()).to.equal(0);
    });
  });

  describe("Deposits", function () {
    it("Should accept ETH deposits", async function () {
      const depositAmount = hre.ethers.parseEther("1.0");
      
      await expect(
        defile.connect(user1).deposit({ value: depositAmount })
      ).to.emit(defile, "Deposited")
        .withArgs(user1.address, depositAmount);

      const balance = await defile.balances(user1.address);
      expect(balance).to.equal(depositAmount);
    });

    it("Should revert on zero deposit", async function () {
      await expect(
        defile.connect(user1).deposit({ value: 0 })
      ).to.be.revertedWith("Amount must be greater than 0");
    });

    it("Should track total deposits correctly", async function () {
      const amount1 = hre.ethers.parseEther("1.0");
      const amount2 = hre.ethers.parseEther("2.0");

      await defile.connect(user1).deposit({ value: amount1 });
      await defile.connect(user2).deposit({ value: amount2 });

      expect(await defile.totalDeposits()).to.equal(amount1 + amount2);
    });

    it("Should allow multiple deposits from same user", async function () {
      const amount1 = hre.ethers.parseEther("1.0");
      const amount2 = hre.ethers.parseEther("0.5");

      await defile.connect(user1).deposit({ value: amount1 });
      await defile.connect(user1).deposit({ value: amount2 });

      const balance = await defile.balances(user1.address);
      expect(balance).to.equal(amount1 + amount2);
    });
  });

  describe("Withdrawals", function () {
    beforeEach(async function () {
      const depositAmount = hre.ethers.parseEther("10.0");
      await defile.connect(user1).deposit({ value: depositAmount });
    });

    it("Should allow withdrawal of deposited funds", async function () {
      const withdrawAmount = hre.ethers.parseEther("5.0");
      
      await expect(
        defile.connect(user1).withdraw(withdrawAmount)
      ).to.emit(defile, "Withdrawn")
        .withArgs(user1.address, withdrawAmount);

      const balance = await defile.balances(user1.address);
      expect(balance).to.equal(hre.ethers.parseEther("5.0"));
    });

    it("Should revert on zero withdrawal", async function () {
      await expect(
        defile.connect(user1).withdraw(0)
      ).to.be.revertedWith("Amount must be greater than 0");
    });

    it("Should revert on insufficient balance", async function () {
      const withdrawAmount = hre.ethers.parseEther("20.0");
      
      await expect(
        defile.connect(user1).withdraw(withdrawAmount)
      ).to.be.revertedWith("Insufficient balance");
    });

    it("Should transfer ETH correctly on withdrawal", async function () {
      const withdrawAmount = hre.ethers.parseEther("5.0");
      const balanceBefore = await hre.ethers.provider.getBalance(user1.address);
      
      const tx = await defile.connect(user1).withdraw(withdrawAmount);
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      
      const balanceAfter = await hre.ethers.provider.getBalance(user1.address);
      const expectedBalance = balanceBefore + withdrawAmount - gasUsed;
      
      expect(balanceAfter).to.be.closeTo(expectedBalance, hre.ethers.parseEther("0.001"));
    });
  });

  describe("Borrowing", function () {
    beforeEach(async function () {
      const depositAmount = hre.ethers.parseEther("10.0");
      await defile.connect(user1).deposit({ value: depositAmount });
    });

    it("Should allow borrowing up to 70% of deposit", async function () {
      const borrowAmount = hre.ethers.parseEther("7.0");
      
      await expect(
        defile.connect(user1).borrow(borrowAmount)
      ).to.emit(defile, "Borrowed")
        .withArgs(user1.address, borrowAmount);

      const loan = await defile.loans(user1.address);
      expect(loan.amount).to.equal(borrowAmount);
    });

    it("Should revert if borrowing more than 70% of deposit", async function () {
      const borrowAmount = hre.ethers.parseEther("7.5");
      
      await expect(
        defile.connect(user1).borrow(borrowAmount)
      ).to.be.revertedWith("Cannot borrow more than 70% of deposit");
    });

    it("Should revert on zero borrow amount", async function () {
      await expect(
        defile.connect(user1).borrow(0)
      ).to.be.revertedWith("Amount must be greater than 0");
    });

    it("Should revert if contract has insufficient funds", async function () {
      await defile.connect(owner).withdraw(hre.ethers.parseEther("9.0"));
      
      const borrowAmount = hre.ethers.parseEther("7.0");
      await expect(
        defile.connect(user1).borrow(borrowAmount)
      ).to.be.revertedWith("Insufficient contract balance");
    });

    it("Should revert if user already has a loan", async function () {
      await defile.connect(user1).borrow(hre.ethers.parseEther("5.0"));
      
      await expect(
        defile.connect(user1).borrow(hre.ethers.parseEther("1.0"))
      ).to.be.revertedWith("You already have an active loan");
    });

    it("Should track total borrowed correctly", async function () {
      const depositAmount2 = hre.ethers.parseEther("10.0");
      await defile.connect(user2).deposit({ value: depositAmount2 });

      await defile.connect(user1).borrow(hre.ethers.parseEther("5.0"));
      await defile.connect(user2).borrow(hre.ethers.parseEther("3.0"));

      expect(await defile.totalBorrowed()).to.equal(hre.ethers.parseEther("8.0"));
    });
  });

  describe("Loan Repayment", function () {
    beforeEach(async function () {
      const depositAmount = hre.ethers.parseEther("10.0");
      await defile.connect(user1).deposit({ value: depositAmount });
      await defile.connect(user1).borrow(hre.ethers.parseEther("5.0"));
    });

    it("Should allow full loan repayment", async function () {
      const loan = await defile.loans(user1.address);
      const repayAmount = loan.amount;
      
      await expect(
        defile.connect(user1).repayLoan({ value: repayAmount })
      ).to.emit(defile, "LoanRepaid")
        .withArgs(user1.address, repayAmount);

      const loanAfter = await defile.loans(user1.address);
      expect(loanAfter.amount).to.equal(0);
      expect(loanAfter.isActive).to.equal(false);
    });

    it("Should allow partial loan repayment", async function () {
      const repayAmount = hre.ethers.parseEther("2.0");
      
      await defile.connect(user1).repayLoan({ value: repayAmount });

      const loan = await defile.loans(user1.address);
      expect(loan.amount).to.equal(hre.ethers.parseEther("3.0"));
      expect(loan.isActive).to.equal(true);
    });

    it("Should revert on zero repayment", async function () {
      await expect(
        defile.connect(user1).repayLoan({ value: 0 })
      ).to.be.revertedWith("Amount must be greater than 0");
    });

    it("Should revert if no active loan", async function () {
      await expect(
        defile.connect(user2).repayLoan({ value: hre.ethers.parseEther("1.0") })
      ).to.be.revertedWith("No active loan to repay");
    });

    it("Should handle overpayment correctly", async function () {
      const loan = await defile.loans(user1.address);
      const overpayAmount = loan.amount + hre.ethers.parseEther("1.0");
      
      await defile.connect(user1).repayLoan({ value: overpayAmount });

      const loanAfter = await defile.loans(user1.address);
      expect(loanAfter.amount).to.equal(0);
      expect(loanAfter.isActive).to.equal(false);
    });
  });

  describe("Auto-Repayment", function () {
    beforeEach(async function () {
      const depositAmount = hre.ethers.parseEther("10.0");
      await defile.connect(user1).deposit({ value: depositAmount });
      await defile.connect(user1).borrow(hre.ethers.parseEther("5.0"));
    });

    it("Should enable auto-repayment", async function () {
      await expect(
        defile.connect(user1).enableAutoRepayment(30)
      ).to.emit(defile, "AutoRepaymentEnabled")
        .withArgs(user1.address, 30);

      const loan = await defile.loans(user1.address);
      expect(loan.autoRepayEnabled).to.equal(true);
      expect(loan.repaymentPercentage).to.equal(30);
    });

    it("Should revert if percentage is zero", async function () {
      await expect(
        defile.connect(user1).enableAutoRepayment(0)
      ).to.be.revertedWith("Percentage must be between 1 and 100");
    });

    it("Should revert if percentage exceeds 100", async function () {
      await expect(
        defile.connect(user1).enableAutoRepayment(101)
      ).to.be.revertedWith("Percentage must be between 1 and 100");
    });

    it("Should revert if no active loan", async function () {
      await expect(
        defile.connect(user2).enableAutoRepayment(50)
      ).to.be.revertedWith("No active loan");
    });

    it("Should disable auto-repayment", async function () {
      await defile.connect(user1).enableAutoRepayment(30);
      
      await expect(
        defile.connect(user1).disableAutoRepayment()
      ).to.emit(defile, "AutoRepaymentDisabled")
        .withArgs(user1.address);

      const loan = await defile.loans(user1.address);
      expect(loan.autoRepayEnabled).to.equal(false);
    });
  });

  describe("Payment Interception", function () {
    beforeEach(async function () {
      const depositAmount = hre.ethers.parseEther("10.0");
      await defile.connect(user1).deposit({ value: depositAmount });
      await defile.connect(user1).borrow(hre.ethers.parseEther("5.0"));
      await defile.connect(user1).enableAutoRepayment(30);
    });

    it("Should intercept incoming payments when auto-repay is enabled", async function () {
      const incomingPayment = hre.ethers.parseEther("1.0");
      const expectedRepayment = (incomingPayment * 30n) / 100n;
      
      const loanBefore = await defile.loans(user1.address);
      
      await user2.sendTransaction({
        to: await defile.getAddress(),
        value: incomingPayment,
        data: hre.ethers.AbiCoder.defaultAbiCoder().encode(["address"], [user1.address])
      });

      const loanAfter = await defile.loans(user1.address);
      expect(loanAfter.amount).to.equal(loanBefore.amount - expectedRepayment);
    });

    it("Should handle full loan repayment via interception", async function () {
      const loan = await defile.loans(user1.address);
      const largePayment = hre.ethers.parseEther("100.0");
      
      await user2.sendTransaction({
        to: await defile.getAddress(),
        value: largePayment,
        data: hre.ethers.AbiCoder.defaultAbiCoder().encode(["address"], [user1.address])
      });

      const loanAfter = await defile.loans(user1.address);
      expect(loanAfter.amount).to.equal(0);
      expect(loanAfter.isActive).to.equal(false);
    });
  });

  describe("Admin Functions", function () {
    it("Should allow owner to withdraw contract balance", async function () {
      const depositAmount = hre.ethers.parseEther("10.0");
      await defile.connect(user1).deposit({ value: depositAmount });
      
      const withdrawAmount = hre.ethers.parseEther("5.0");
      await expect(
        defile.connect(owner).withdraw(withdrawAmount)
      ).to.emit(defile, "Withdrawn")
        .withArgs(owner.address, withdrawAmount);
    });

    it("Should prevent non-owner from withdrawing contract balance", async function () {
      await expect(
        defile.connect(user1).withdraw(hre.ethers.parseEther("1.0"))
      ).to.be.revertedWith("Insufficient balance");
    });

    it("Should return correct contract balance", async function () {
      const depositAmount = hre.ethers.parseEther("10.0");
      await defile.connect(user1).deposit({ value: depositAmount });
      
      const contractBalance = await defile.getContractBalance();
      expect(contractBalance).to.equal(depositAmount);
    });
  });

  describe("View Functions", function () {
    beforeEach(async function () {
      const depositAmount = hre.ethers.parseEther("10.0");
      await defile.connect(user1).deposit({ value: depositAmount });
      await defile.connect(user1).borrow(hre.ethers.parseEther("5.0"));
    });

    it("Should return user balance", async function () {
      const balance = await defile.getUserBalance(user1.address);
      expect(balance).to.equal(hre.ethers.parseEther("10.0"));
    });

    it("Should return user loan info", async function () {
      const loan = await defile.getUserLoan(user1.address);
      expect(loan[0]).to.equal(hre.ethers.parseEther("5.0")); // amount
      expect(loan[1]).to.equal(true); // isActive
      expect(loan[2]).to.equal(false); // autoRepayEnabled
      expect(loan[3]).to.equal(0); // repaymentPercentage
    });

    it("Should calculate available borrow amount correctly", async function () {
      const available = await defile.getAvailableBorrowAmount(user1.address);
      const expected = hre.ethers.parseEther("2.0"); // 70% of 10 ETH = 7 ETH, already borrowed 5 ETH
      expect(available).to.equal(expected);
    });

    it("Should return zero for users without deposits", async function () {
      const available = await defile.getAvailableBorrowAmount(user2.address);
      expect(available).to.equal(0);
    });
  });
});