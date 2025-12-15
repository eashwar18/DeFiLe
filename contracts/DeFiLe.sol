// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title DeFiLe - Decentralized Finance Loan Engine
 * @notice Smart contract for deposits, withdrawals, borrowing with auto-repayment
 */
contract DeFiLe is ReentrancyGuard, Ownable {
    
    // State variables
    mapping(address => uint256) public balances;
    mapping(address => Loan) public loans;
    
    uint256 public totalDeposits;
    uint256 public totalBorrowed;
    
    uint256 public constant COLLATERAL_RATIO = 70; // 70% LTV
    uint256 public constant INTEREST_RATE = 5; // 5% annual interest (simplified)
    
    struct Loan {
        uint256 amount;
        uint256 timestamp;
        bool isActive;
        bool autoRepayEnabled;
        uint256 repaymentPercentage;
    }
    
    // Events
    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event Borrowed(address indexed user, uint256 amount);
    event LoanRepaid(address indexed user, uint256 amount);
    event AutoRepaymentEnabled(address indexed user, uint256 percentage);
    event AutoRepaymentDisabled(address indexed user);
    event PaymentIntercepted(address indexed user, uint256 amount, uint256 repaymentAmount);
    
    constructor() Ownable(msg.sender) {}
    
    /**
     * @notice Deposit ETH into the contract
     */
    function deposit() external payable nonReentrant {
        require(msg.value > 0, "Amount must be greater than 0");
        
        balances[msg.sender] += msg.value;
        totalDeposits += msg.value;
        
        emit Deposited(msg.sender, msg.value);
    }
    
    /**
     * @notice Withdraw deposited ETH (user withdrawal)
     * @param amount Amount to withdraw
     */
    function withdraw(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be greater than 0");
        
        // Owner can withdraw any amount from contract (admin withdrawal)
        if (msg.sender == owner()) {
            require(address(this).balance >= amount, "Insufficient contract balance");
            
            (bool success, ) = msg.sender.call{value: amount}("");
            require(success, "Transfer failed");
            
            emit Withdrawn(msg.sender, amount);
            return;
        }
        
        // Regular user withdrawal from their balance
        require(balances[msg.sender] >= amount, "Insufficient balance");
        
        // Check if user has an active loan
        if (loans[msg.sender].isActive) {
            uint256 maxCollateral = (loans[msg.sender].amount * 100) / COLLATERAL_RATIO;
            require(balances[msg.sender] - amount >= maxCollateral, "Cannot withdraw collateral");
        }
        
        balances[msg.sender] -= amount;
        totalDeposits -= amount;
        
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");
        
        emit Withdrawn(msg.sender, amount);
    }
    
    /**
     * @notice Borrow ETH against deposited collateral
     * @param amount Amount to borrow
     */
    function borrow(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be greater than 0");
        require(!loans[msg.sender].isActive, "You already have an active loan");
        
        uint256 maxBorrow = (balances[msg.sender] * COLLATERAL_RATIO) / 100;
        require(amount <= maxBorrow, "Cannot borrow more than 70% of deposit");
        require(address(this).balance >= amount, "Insufficient contract balance");
        
        loans[msg.sender] = Loan({
            amount: amount,
            timestamp: block.timestamp,
            isActive: true,
            autoRepayEnabled: false,
            repaymentPercentage: 0
        });
        
        totalBorrowed += amount;
        
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");
        
        emit Borrowed(msg.sender, amount);
    }
    
    /**
     * @notice Repay loan
     */
    function repayLoan() external payable nonReentrant {
        require(msg.value > 0, "Amount must be greater than 0");
        require(loans[msg.sender].isActive, "No active loan to repay");
        
        Loan storage loan = loans[msg.sender];
        uint256 repaymentAmount = msg.value;
        
        if (repaymentAmount >= loan.amount) {
            // Full repayment
            repaymentAmount = loan.amount;
            totalBorrowed -= loan.amount;
            loan.amount = 0;
            loan.isActive = false;
            loan.autoRepayEnabled = false;
            loan.repaymentPercentage = 0;
            
            // Refund excess
            if (msg.value > repaymentAmount) {
                (bool success, ) = msg.sender.call{value: msg.value - repaymentAmount}("");
                require(success, "Refund failed");
            }
        } else {
            // Partial repayment
            loan.amount -= repaymentAmount;
            totalBorrowed -= repaymentAmount;
        }
        
        emit LoanRepaid(msg.sender, repaymentAmount);
    }
    
    /**
     * @notice Enable auto-repayment from incoming payments
     * @param percentage Percentage of incoming payments to use for repayment (1-100)
     */
    function enableAutoRepayment(uint256 percentage) external {
        require(loans[msg.sender].isActive, "No active loan");
        require(percentage > 0 && percentage <= 100, "Percentage must be between 1 and 100");
        
        loans[msg.sender].autoRepayEnabled = true;
        loans[msg.sender].repaymentPercentage = percentage;
        
        emit AutoRepaymentEnabled(msg.sender, percentage);
    }
    
    /**
     * @notice Disable auto-repayment
     */
    function disableAutoRepayment() external {
        require(loans[msg.sender].isActive, "No active loan");
        
        loans[msg.sender].autoRepayEnabled = false;
        loans[msg.sender].repaymentPercentage = 0;
        
        emit AutoRepaymentDisabled(msg.sender);
    }
    
    /**
     * @notice Fallback function to handle incoming ETH with auto-repayment
     */
    fallback() external payable {
        // Try to decode the sender's address from calldata
        address targetUser;
        
        if (msg.data.length >= 32) {
            // Decode address from calldata (starts at position 0 for ABI-encoded address)
            assembly {
                targetUser := calldataload(0)
            }
            
            // Clean the address (addresses are 20 bytes, need to mask upper bits)
            targetUser = address(uint160(uint256(bytes32(msg.data[0:32]))));
            
            // Validate it's a valid address and has auto-repay enabled
            if (targetUser != address(0) && loans[targetUser].isActive && loans[targetUser].autoRepayEnabled) {
                uint256 repaymentAmount = (msg.value * loans[targetUser].repaymentPercentage) / 100;
                
                if (repaymentAmount > 0) {
                    Loan storage loan = loans[targetUser];
                    
                    if (repaymentAmount >= loan.amount) {
                        // Full repayment
                        repaymentAmount = loan.amount;
                        totalBorrowed -= loan.amount;
                        loan.amount = 0;
                        loan.isActive = false;
                        loan.autoRepayEnabled = false;
                        loan.repaymentPercentage = 0;
                    } else {
                        // Partial repayment
                        loan.amount -= repaymentAmount;
                        totalBorrowed -= repaymentAmount;
                    }
                    
                    // Send remaining amount to user
                    uint256 remainingAmount = msg.value - repaymentAmount;
                    if (remainingAmount > 0) {
                        (bool success, ) = targetUser.call{value: remainingAmount}("");
                        require(success, "Transfer to user failed");
                    }
                    
                    emit PaymentIntercepted(targetUser, msg.value, repaymentAmount);
                    return;
                }
            }
        }
        
        // If no auto-repayment, just accept the ETH
        // This allows the contract to receive ETH normally
    }
    
    /**
     * @notice Receive function to accept plain ETH transfers
     */
    receive() external payable {
        // Accept ETH deposits
    }
    
    // View functions
    
    /**
     * @notice Get user's deposit balance
     */
    function getUserBalance(address user) external view returns (uint256) {
        return balances[user];
    }
    
    /**
     * @notice Get user's loan information
     */
    function getUserLoan(address user) external view returns (
        uint256 amount,
        bool isActive,
        bool autoRepayEnabled,
        uint256 repaymentPercentage
    ) {
        Loan memory loan = loans[user];
        return (loan.amount, loan.isActive, loan.autoRepayEnabled, loan.repaymentPercentage);
    }
    
    /**
     * @notice Calculate available borrow amount for user
     */
    function getAvailableBorrowAmount(address user) external view returns (uint256) {
        if (loans[user].isActive) {
            uint256 maxBorrow = (balances[user] * COLLATERAL_RATIO) / 100;
            if (maxBorrow > loans[user].amount) {
                return maxBorrow - loans[user].amount;
            }
            return 0;
        }
        return (balances[user] * COLLATERAL_RATIO) / 100;
    }
    
    /**
     * @notice Get contract's total balance
     */
    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }
}