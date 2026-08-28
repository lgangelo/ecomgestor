import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { PERMISSIONS } from '@ecommerce-manager/shared';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { FinanceService } from './finance.service';
import { CreateExpenseCategoryDto } from './dto/create-expense-category.dto';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ListExpensesQueryDto } from './dto/list-expenses-query.dto';
import { ListFeesQueryDto } from './dto/list-fees-query.dto';
import { FinancePeriodQueryDto } from './dto/finance-period-query.dto';

@Controller('finance')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Get('expense-categories')
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  listExpenseCategories(@CurrentUser() user: AuthenticatedUser) {
    return this.financeService.listExpenseCategories(user.companyId);
  }

  @Post('expense-categories')
  @RequirePermissions(PERMISSIONS.FINANCE_MANAGE)
  createExpenseCategory(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateExpenseCategoryDto) {
    return this.financeService.createExpenseCategory(user.companyId, user.userId, dto);
  }

  @Get('expenses')
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  listExpenses(@CurrentUser() user: AuthenticatedUser, @Query() query: ListExpensesQueryDto) {
    return this.financeService.listExpenses(user.companyId, query);
  }

  @Post('expenses')
  @RequirePermissions(PERMISSIONS.FINANCE_MANAGE)
  createExpense(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateExpenseDto) {
    return this.financeService.createExpense(user.companyId, user.userId, dto);
  }

  @Get('fees')
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  listFees(@CurrentUser() user: AuthenticatedUser, @Query() query: ListFeesQueryDto) {
    return this.financeService.listFees(user.companyId, query);
  }

  @Get('overview')
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  getOverview(@CurrentUser() user: AuthenticatedUser, @Query() query: FinancePeriodQueryDto) {
    return this.financeService.getOverview(user.companyId, query);
  }

  @Get('monthly-closings')
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  listMonthlyClosings(@CurrentUser() user: AuthenticatedUser) {
    return this.financeService.listMonthlyClosings(user.companyId);
  }

  @Get('monthly-closings/:id')
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  getMonthlyClosing(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.financeService.getMonthlyClosing(user.companyId, id);
  }

  @Post('monthly-closings/:referenceMonth/close')
  @RequirePermissions(PERMISSIONS.FINANCE_MANAGE)
  closeMonth(@CurrentUser() user: AuthenticatedUser, @Param('referenceMonth') referenceMonth: string) {
    return this.financeService.closeMonth(user.companyId, user.userId, referenceMonth);
  }
}
