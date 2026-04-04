import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
} from "@nestjs/common";
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from "@nestjs/swagger";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { User } from "../../entities/user.entity";
import { FinanceService } from "./finance.service";
import {
  DepositDto,
  WithdrawDto,
  PaginationDto,
  WalletResponseDto,
  TransactionResponseDto,
  PaginatedTransactionsDto,
} from "./dto/finance.dto";

@ApiTags("Finance")
@ApiBearerAuth()
@Controller("finance")
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Get("wallet")
  @ApiOperation({ summary: "Get current user wallet" })
  @ApiResponse({ status: 200, type: WalletResponseDto })
  @ApiResponse({ status: 404, description: "Wallet not found" })
  async getWallet(@CurrentUser() user: User): Promise<WalletResponseDto> {
    return this.financeService.getWallet(user.id);
  }

  @Post("wallet")
  @ApiOperation({ summary: "Create wallet for current user" })
  @ApiResponse({ status: 201, type: WalletResponseDto })
  @ApiResponse({ status: 409, description: "Wallet already exists" })
  async createWallet(@CurrentUser() user: User): Promise<WalletResponseDto> {
    return this.financeService.createWallet(user.id);
  }

  @Post("deposit")
  @ApiOperation({ summary: "Deposit funds into wallet" })
  @ApiResponse({ status: 201, type: TransactionResponseDto })
  @ApiResponse({ status: 404, description: "Wallet not found" })
  async deposit(
    @CurrentUser() user: User,
    @Body() dto: DepositDto,
  ): Promise<TransactionResponseDto> {
    return this.financeService.deposit(user.id, dto.amount);
  }

  @Post("withdraw")
  @ApiOperation({ summary: "Withdraw funds from wallet" })
  @ApiResponse({ status: 201, type: TransactionResponseDto })
  @ApiResponse({ status: 400, description: "Insufficient balance" })
  @ApiResponse({ status: 404, description: "Wallet not found" })
  async withdraw(
    @CurrentUser() user: User,
    @Body() dto: WithdrawDto,
  ): Promise<TransactionResponseDto> {
    return this.financeService.withdraw(user.id, dto.amount);
  }

  @Get("transactions")
  @ApiOperation({ summary: "List current user transactions" })
  @ApiResponse({ status: 200, type: PaginatedTransactionsDto })
  async getTransactions(
    @CurrentUser() user: User,
    @Query() query: PaginationDto,
  ): Promise<PaginatedTransactionsDto> {
    return this.financeService.getTransactions(
      user.id,
      query.limit ?? 20,
      query.offset ?? 0,
    );
  }

  @Roles("admin")
  @Get("wallet/:userId")
  @ApiOperation({ summary: "Get wallet for any user (admin)" })
  @ApiResponse({ status: 200, type: WalletResponseDto })
  async getWalletAdmin(
    @Param("userId", ParseUUIDPipe) userId: string,
  ): Promise<WalletResponseDto> {
    return this.financeService.getWallet(userId);
  }

  @Roles("admin")
  @Get("transactions/:userId")
  @ApiOperation({ summary: "List transactions for any user (admin)" })
  @ApiResponse({ status: 200, type: PaginatedTransactionsDto })
  async getTransactionsAdmin(
    @Param("userId", ParseUUIDPipe) userId: string,
    @Query() query: PaginationDto,
  ): Promise<PaginatedTransactionsDto> {
    return this.financeService.getTransactions(
      userId,
      query.limit ?? 20,
      query.offset ?? 0,
    );
  }
}
