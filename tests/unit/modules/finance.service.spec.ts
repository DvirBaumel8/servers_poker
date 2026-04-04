import { describe, it, expect, vi, beforeEach } from "vitest";
import { FinanceService } from "../../../src/modules/finance/finance.service";
import { BadRequestException, ConflictException } from "@nestjs/common";

// Mock dependencies
const mockWalletRepo = {
  findByUserId: vi.fn(),
  findByUserIdOrThrow: vi.fn(),
  create: vi.fn(),
  creditBalance: vi.fn(),
  debitBalance: vi.fn(),
};

const mockTransactionRepo = {
  create: vi.fn(),
  findByWalletId: vi.fn(),
};

const mockDataSource = {
  transaction: vi.fn((cb: (manager: unknown) => Promise<unknown>) =>
    cb("manager"),
  ),
};

const mockEventEmitter = {
  emit: vi.fn(),
};

function createService(): FinanceService {
  return new FinanceService(
    mockWalletRepo as any,
    mockTransactionRepo as any,
    mockDataSource as any,
    mockEventEmitter as any,
  );
}

describe("FinanceService", () => {
  let service: FinanceService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = createService();
  });

  describe("createWallet", () => {
    it("should create wallet with 0 balance", async () => {
      mockWalletRepo.findByUserId.mockResolvedValue(null);
      mockWalletRepo.create.mockResolvedValue({
        id: "wallet-1",
        user_id: "user-1",
        balance: 0n,
        created_at: new Date(),
      });

      const result = await service.createWallet("user-1");
      expect(result.balance).toBe("0");
      expect(result.user_id).toBe("user-1");
      expect(mockWalletRepo.create).toHaveBeenCalledWith({
        user_id: "user-1",
        balance: 0n,
      });
    });

    it("should throw ConflictException if wallet already exists", async () => {
      mockWalletRepo.findByUserId.mockResolvedValue({ id: "existing" });

      await expect(service.createWallet("user-1")).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe("deposit", () => {
    it("should credit wallet and create transaction record", async () => {
      const wallet = { id: "wallet-1", user_id: "user-1", balance: 100n };
      mockWalletRepo.findByUserIdOrThrow.mockResolvedValue(wallet);
      mockWalletRepo.creditBalance.mockResolvedValue({
        ...wallet,
        balance: 200n,
      });
      mockTransactionRepo.create.mockResolvedValue({
        id: "tx-1",
        wallet_id: "wallet-1",
        type: "deposit",
        amount: 100n,
        reference_id: null,
        description: "Deposit of 100",
        created_at: new Date(),
      });

      const result = await service.deposit("user-1", 100);
      expect(result.type).toBe("deposit");
      expect(result.amount).toBe("100");
    });
  });

  describe("withdraw", () => {
    it("should debit wallet and create transaction record", async () => {
      const wallet = { id: "wallet-1", user_id: "user-1", balance: 500n };
      mockWalletRepo.findByUserIdOrThrow.mockResolvedValue(wallet);
      mockWalletRepo.debitBalance.mockResolvedValue({
        ...wallet,
        balance: 400n,
      });
      mockTransactionRepo.create.mockResolvedValue({
        id: "tx-2",
        wallet_id: "wallet-1",
        type: "withdrawal",
        amount: 100n,
        reference_id: null,
        description: "Withdrawal of 100",
        created_at: new Date(),
      });

      const result = await service.withdraw("user-1", 100);
      expect(result.type).toBe("withdrawal");
      expect(result.amount).toBe("100");
    });

    it("should throw BadRequestException if insufficient balance", async () => {
      const wallet = { id: "wallet-1", user_id: "user-1", balance: 50n };
      mockWalletRepo.findByUserIdOrThrow.mockResolvedValue(wallet);
      mockWalletRepo.debitBalance.mockResolvedValue(null);

      await expect(service.withdraw("user-1", 100)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe("getTransactions", () => {
    it("should return paginated transaction list", async () => {
      const wallet = { id: "wallet-1", user_id: "user-1", balance: 500n };
      mockWalletRepo.findByUserIdOrThrow.mockResolvedValue(wallet);
      mockTransactionRepo.findByWalletId.mockResolvedValue([
        [
          {
            id: "tx-1",
            wallet_id: "wallet-1",
            type: "deposit",
            amount: 100n,
            reference_id: null,
            description: "test",
            created_at: new Date(),
          },
        ],
        1,
      ]);

      const result = await service.getTransactions("user-1", 20, 0);
      expect(result.total).toBe(1);
      expect(result.data).toHaveLength(1);
      expect(result.limit).toBe(20);
      expect(result.offset).toBe(0);
    });

    it("should return empty list for wallet with no transactions", async () => {
      const wallet = { id: "wallet-1", user_id: "user-1", balance: 0n };
      mockWalletRepo.findByUserIdOrThrow.mockResolvedValue(wallet);
      mockTransactionRepo.findByWalletId.mockResolvedValue([[], 0]);

      const result = await service.getTransactions("user-1");
      expect(result.total).toBe(0);
      expect(result.data).toHaveLength(0);
    });
  });
});
