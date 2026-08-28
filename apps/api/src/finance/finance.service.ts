import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { paginate, type PaginatedResult } from '../common/dto/pagination.dto';
import { CreateExpenseCategoryDto } from './dto/create-expense-category.dto';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ListExpensesQueryDto } from './dto/list-expenses-query.dto';
import { ListFeesQueryDto } from './dto/list-fees-query.dto';
import { FinancePeriodQueryDto } from './dto/finance-period-query.dto';
import {
  computeFinanceAggregates,
  getCurrentMonthRange,
  getMonthRangeFromReference,
} from './finance-aggregates.util';
import type { Prisma } from '@ecommerce-manager/database';

const MANAGEMENT_DISCLAIMER =
  'Resultado gerencial estimado. Não substitui apuração fiscal ou contábil.';

export interface ExpenseListItem {
  id: string;
  categoryName: string;
  description: string;
  amount: Prisma.Decimal;
  date: Date;
  paymentMethod: string | null;
}

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listExpenseCategories(companyId: string) {
    const categories = await this.prisma.client.expenseCategory.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
    return categories;
  }

  async createExpenseCategory(companyId: string, userId: string, dto: CreateExpenseCategoryDto) {
    const category = await this.prisma.client.expenseCategory.create({
      data: { companyId, name: dto.name },
    });

    await this.audit.log({
      companyId,
      userId,
      action: 'CREATE',
      entity: 'expense_category',
      entityId: category.id,
      newValue: category,
    });

    return { id: category.id, name: category.name };
  }

  async listExpenses(
    companyId: string,
    query: ListExpensesQueryDto,
  ): Promise<PaginatedResult<ExpenseListItem>> {
    const where: Prisma.ExpenseWhereInput = {
      companyId,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            date: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.client.expense.findMany({
        where,
        include: { category: { select: { name: true } } },
        orderBy: { date: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.client.expense.count({ where }),
    ]);

    const mapped: ExpenseListItem[] = items.map((item) => ({
      id: item.id,
      categoryName: item.category.name,
      description: item.description,
      amount: item.amount,
      date: item.date,
      paymentMethod: item.paymentMethod,
    }));

    return paginate(mapped, total, query.page, query.pageSize);
  }

  async createExpense(companyId: string, userId: string, dto: CreateExpenseDto) {
    const category = await this.prisma.client.expenseCategory.findFirst({
      where: { id: dto.categoryId, companyId },
    });
    if (!category) {
      throw new NotFoundException('Categoria de despesa não encontrada.');
    }

    const expense = await this.prisma.client.expense.create({
      data: {
        companyId,
        categoryId: dto.categoryId,
        description: dto.description,
        amount: dto.amount,
        date: new Date(dto.date),
        paymentMethod: dto.paymentMethod ?? null,
      },
    });

    await this.audit.log({
      companyId,
      userId,
      action: 'CREATE',
      entity: 'expense',
      entityId: expense.id,
      newValue: expense,
    });

    return {
      id: expense.id,
      categoryName: category.name,
      description: expense.description,
      amount: expense.amount,
      date: expense.date,
      paymentMethod: expense.paymentMethod,
    };
  }

  async listFees(companyId: string, query: ListFeesQueryDto) {
    const where: Prisma.MarketplaceFeeWhereInput = {
      channel: { companyId },
      ...(query.channelId ? { channelId: query.channelId } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.client.marketplaceFee.findMany({
        where,
        include: { channel: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.client.marketplaceFee.count({ where }),
    ]);

    const mapped = items.map((item) => ({
      id: item.id,
      channelName: item.channel.name,
      orderId: item.orderId,
      feeType: item.feeType,
      amount: item.amount,
      createdAt: item.createdAt,
    }));

    return paginate(mapped, total, query.page, query.pageSize);
  }

  async getOverview(companyId: string, query: FinancePeriodQueryDto) {
    const { start, end } = this.resolvePeriod(query.dateFrom, query.dateTo);
    const aggregates = await computeFinanceAggregates(this.prisma, companyId, start, end);
    return { ...aggregates, disclaimer: MANAGEMENT_DISCLAIMER };
  }

  async listMonthlyClosings(companyId: string) {
    return this.prisma.client.monthlyClosing.findMany({
      where: { companyId },
      orderBy: { referenceMonth: 'desc' },
    });
  }

  async getMonthlyClosing(companyId: string, id: string) {
    const closing = await this.prisma.client.monthlyClosing.findFirst({
      where: { id, companyId },
    });
    if (!closing) {
      throw new NotFoundException('Fechamento mensal não encontrado.');
    }
    return closing;
  }

  async closeMonth(companyId: string, userId: string, referenceMonth: string) {
    let start: Date;
    let end: Date;
    try {
      ({ start, end } = getMonthRangeFromReference(referenceMonth));
    } catch {
      throw new BadRequestException('referenceMonth inválido. Formato esperado: YYYY-MM.');
    }

    const aggregates = await computeFinanceAggregates(this.prisma, companyId, start, end);

    const existing = await this.prisma.client.monthlyClosing.findUnique({
      where: { companyId_referenceMonth: { companyId, referenceMonth: start } },
    });

    const closing = await this.prisma.client.monthlyClosing.upsert({
      where: { companyId_referenceMonth: { companyId, referenceMonth: start } },
      create: {
        companyId,
        referenceMonth: start,
        ...aggregates,
        status: 'CLOSED',
        closedAt: new Date(),
      },
      update: {
        ...aggregates,
        status: 'CLOSED',
        closedAt: new Date(),
      },
    });

    await this.audit.log({
      companyId,
      userId,
      action: 'UPDATE',
      entity: 'monthly_closing',
      entityId: closing.id,
      oldValue: existing,
      newValue: closing,
    });

    return closing;
  }

  private resolvePeriod(dateFrom?: string, dateTo?: string): { start: Date; end: Date } {
    if (!dateFrom && !dateTo) {
      return getCurrentMonthRange();
    }
    const start = dateFrom ? new Date(dateFrom) : getCurrentMonthRange().start;
    const end = dateTo ? this.toExclusiveEnd(dateTo) : getCurrentMonthRange().end;
    return { start, end };
  }

  /**
   * Converte um `dateTo` de query string em limite EXCLUSIVO para uso com `lt` nas agregações.
   * Quando informado apenas como data (YYYY-MM-DD), o dia inteiro é incluído avançando
   * o limite para o início do dia seguinte; quando já traz horário, é usado como está.
   */
  private toExclusiveEnd(dateTo: string): Date {
    const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(dateTo);
    if (!isDateOnly) {
      return new Date(dateTo);
    }
    const date = new Date(`${dateTo}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    return date;
  }
}
