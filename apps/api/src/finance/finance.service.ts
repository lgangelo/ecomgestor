import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { FiscalService } from '../fiscal/fiscal.service';
import { paginate, type PaginatedResult } from '../common/dto/pagination.dto';
import { endOfDayExclusive } from '../common/date/day-range.util';
import { CreateExpenseCategoryDto } from './dto/create-expense-category.dto';
import { UpdateExpenseCategoryDto } from './dto/update-expense-category.dto';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ListExpensesQueryDto } from './dto/list-expenses-query.dto';
import { ListFeesQueryDto } from './dto/list-fees-query.dto';
import { FinancePeriodQueryDto } from './dto/finance-period-query.dto';
import { CreateTaxConfigurationDto } from './dto/create-tax-configuration.dto';
import { CreateRecurringExpenseDto } from './dto/create-recurring-expense.dto';
import { ReopenClosingDto } from './dto/reopen-closing.dto';
import {
  computeFinanceAggregates,
  getCurrentMonthRange,
  getMonthRangeFromReference,
} from './finance-aggregates.util';
import { buildMonthlyClosingChecklist } from './monthly-closing-checklist.util';
import type { Prisma } from '@ecommerce-manager/database';

const MANAGEMENT_DISCLAIMER =
  'Resultado gerencial estimado. Não substitui apuração fiscal ou contábil.';

export interface ExpenseListItem {
  id: string;
  categoryId: string;
  categoryName: string;
  description: string;
  amount: Prisma.Decimal;
  date: Date;
  competenceDate: Date;
  status: string;
  isRecurring: boolean;
  paymentMethod: string | null;
}

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly fiscalService: FiscalService,
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

  async updateExpenseCategory(id: string, companyId: string, userId: string, dto: UpdateExpenseCategoryDto) {
    const existing = await this.prisma.client.expenseCategory.findFirst({ where: { id, companyId } });
    if (!existing) throw new NotFoundException('Categoria de despesa não encontrada.');

    const category = await this.prisma.client.expenseCategory.update({
      where: { id },
      data: { name: dto.name },
    });

    await this.audit.log({
      companyId,
      userId,
      action: 'UPDATE',
      entity: 'expense_category',
      entityId: category.id,
      oldValue: existing,
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
              ...(query.dateTo ? { lt: endOfDayExclusive(query.dateTo) } : {}),
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
      categoryId: item.categoryId,
      categoryName: item.category.name,
      description: item.description,
      amount: item.amount,
      date: item.date,
      competenceDate: item.competenceDate,
      status: item.status,
      isRecurring: item.isRecurring,
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

    const date = new Date(dto.date);
    await this.assertPeriodNotLocked(companyId, dto.competenceDate ? new Date(dto.competenceDate) : date);

    const expense = await this.prisma.client.expense.create({
      data: {
        companyId,
        categoryId: dto.categoryId,
        description: dto.description,
        amount: dto.amount,
        date,
        competenceDate: dto.competenceDate ? new Date(dto.competenceDate) : date,
        status: dto.status ?? 'PAID',
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
      competenceDate: expense.competenceDate,
      status: expense.status,
      isRecurring: expense.isRecurring,
      paymentMethod: expense.paymentMethod,
    };
  }

  async updateExpense(id: string, companyId: string, userId: string, dto: UpdateExpenseDto) {
    const existing = await this.prisma.client.expense.findFirst({ where: { id, companyId } });
    if (!existing) throw new NotFoundException('Despesa não encontrada.');

    if (dto.categoryId) {
      const category = await this.prisma.client.expenseCategory.findFirst({
        where: { id: dto.categoryId, companyId },
      });
      if (!category) throw new NotFoundException('Categoria de despesa não encontrada.');
    }

    const date = dto.date ? new Date(dto.date) : existing.date;
    const competenceDate = dto.competenceDate ? new Date(dto.competenceDate) : existing.competenceDate;
    // Bloqueia mudar uma despesa DE ou PARA um período já fechado — nunca só um dos dois lados.
    await this.assertPeriodNotLocked(companyId, existing.competenceDate);
    await this.assertPeriodNotLocked(companyId, competenceDate);

    const expense = await this.prisma.client.expense.update({
      where: { id },
      data: {
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
        ...(dto.date !== undefined ? { date } : {}),
        ...(dto.competenceDate !== undefined ? { competenceDate } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.paymentMethod !== undefined ? { paymentMethod: dto.paymentMethod } : {}),
      },
      include: { category: { select: { name: true } } },
    });

    await this.audit.log({
      companyId,
      userId,
      action: 'UPDATE',
      entity: 'expense',
      entityId: expense.id,
      oldValue: existing,
      newValue: expense,
    });

    return {
      id: expense.id,
      categoryName: expense.category.name,
      description: expense.description,
      amount: expense.amount,
      date: expense.date,
      competenceDate: expense.competenceDate,
      status: expense.status,
      isRecurring: expense.isRecurring,
      paymentMethod: expense.paymentMethod,
    };
  }

  async listFees(companyId: string, query: ListFeesQueryDto) {
    const where: Prisma.MarketplaceFeeWhereInput = {
      channel: { companyId },
      ...(query.channelId ? { channelId: query.channelId } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            feeDate: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lt: endOfDayExclusive(query.dateTo) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.client.marketplaceFee.findMany({
        where,
        include: { channel: { select: { name: true } } },
        orderBy: { feeDate: 'desc' },
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
      date: item.feeDate,
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

  /**
   * Checklist ao vivo + resumo antes de fechar (seções 20-25 da Fase 4) — não persiste nada,
   * só calcula o mesmo conteúdo que `closeMonth` grava como snapshot, para o usuário conferir
   * antes de confirmar.
   */
  async getMonthlyClosingPreview(companyId: string, referenceMonth: string) {
    let start: Date;
    let end: Date;
    try {
      ({ start, end } = getMonthRangeFromReference(referenceMonth));
    } catch {
      throw new BadRequestException('referenceMonth inválido. Formato esperado: YYYY-MM.');
    }

    const [aggregates, checklist, existing] = await Promise.all([
      computeFinanceAggregates(this.prisma, companyId, start, end),
      buildMonthlyClosingChecklist(this.prisma, this.fiscalService, companyId, referenceMonth, start, end),
      this.prisma.client.monthlyClosing.findUnique({
        where: { companyId_referenceMonth: { companyId, referenceMonth: start } },
      }),
    ]);

    return {
      referenceMonth,
      status: existing?.status ?? 'OPEN',
      ...aggregates,
      disclaimer: MANAGEMENT_DISCLAIMER,
      ...checklist,
    };
  }

  async closeMonth(companyId: string, userId: string, referenceMonth: string) {
    let start: Date;
    let end: Date;
    try {
      ({ start, end } = getMonthRangeFromReference(referenceMonth));
    } catch {
      throw new BadRequestException('referenceMonth inválido. Formato esperado: YYYY-MM.');
    }

    const [aggregates, checklist] = await Promise.all([
      computeFinanceAggregates(this.prisma, companyId, start, end),
      buildMonthlyClosingChecklist(this.prisma, this.fiscalService, companyId, referenceMonth, start, end),
    ]);

    // Snapshot de contadores (seção 27) — preserva o que foi mostrado ao fechar; não é
    // contabilidade imutável, o período pode ser reaberto e refeito (seção 26).
    const snapshot = {
      ordersCount: checklist.ordersCount,
      returnsCount: checklist.returnsCount,
      saleInvoiceCount: checklist.fiscal.saleInvoiceCount,
      returnInvoiceCount: checklist.fiscal.returnInvoiceCount,
      fiscalPendingCount: checklist.fiscal.xmlUnavailableCount,
      warningsSnapshot: checklist.warnings as unknown as Prisma.InputJsonValue,
    };

    const existing = await this.prisma.client.monthlyClosing.findUnique({
      where: { companyId_referenceMonth: { companyId, referenceMonth: start } },
    });

    const closing = await this.prisma.client.monthlyClosing.upsert({
      where: { companyId_referenceMonth: { companyId, referenceMonth: start } },
      create: {
        companyId,
        referenceMonth: start,
        ...aggregates,
        ...snapshot,
        status: 'CLOSED',
        closedAt: new Date(),
      },
      update: {
        ...aggregates,
        ...snapshot,
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

  /** Reabre um período fechado (seção 39) — sempre auditado e com motivo obrigatório. */
  async reopenClosing(companyId: string, id: string, userId: string, dto: ReopenClosingDto) {
    const existing = await this.prisma.client.monthlyClosing.findFirst({ where: { id, companyId } });
    if (!existing) throw new NotFoundException('Fechamento mensal não encontrado.');
    if (existing.status !== 'CLOSED') {
      throw new BadRequestException('Este período já está aberto.');
    }

    const updated = await this.prisma.client.monthlyClosing.update({
      where: { id },
      data: {
        status: 'OPEN',
        lastReopenedAt: new Date(),
        lastReopenReason: dto.reason,
      },
    });

    await this.audit.log({
      companyId,
      userId,
      action: 'REOPEN',
      entity: 'monthly_closing',
      entityId: id,
      oldValue: existing,
      newValue: updated,
    });

    return updated;
  }

  /**
   * Bloqueia lançamentos financeiros silenciosos em um período já fechado (seção 39).
   * Usado antes de criar despesas — outros módulos (pedidos, devoluções) podem reutilizar
   * este mesmo guard quando afetarem um período já fechado.
   */
  async assertPeriodNotLocked(companyId: string, date: Date): Promise<void> {
    const referenceMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
    const closing = await this.prisma.client.monthlyClosing.findUnique({
      where: { companyId_referenceMonth: { companyId, referenceMonth } },
    });
    if (closing?.status === 'CLOSED') {
      throw new BadRequestException(
        `O período ${referenceMonth.toISOString().slice(0, 7)} já está fechado. Reabra o período em Fechamento mensal antes de lançar alterações.`,
      );
    }
  }

  // ---------------------------------------------------------------------
  // Impostos estimados (seção 29)
  // ---------------------------------------------------------------------

  async listTaxConfigurations(companyId: string) {
    return this.prisma.client.taxConfiguration.findMany({
      where: { companyId },
      orderBy: { validFrom: 'desc' },
    });
  }

  async createTaxConfiguration(companyId: string, userId: string, dto: CreateTaxConfigurationDto) {
    const config = await this.prisma.client.taxConfiguration.create({
      data: {
        companyId,
        taxRegime: dto.taxRegime,
        estimatedRate: dto.estimatedRate,
        validFrom: new Date(dto.validFrom),
        validTo: dto.validTo ? new Date(dto.validTo) : null,
      },
    });

    await this.audit.log({
      companyId,
      userId,
      action: 'CREATE',
      entity: 'tax_configuration',
      entityId: config.id,
      newValue: config,
    });

    return config;
  }

  // ---------------------------------------------------------------------
  // Despesas recorrentes (seção 23)
  // ---------------------------------------------------------------------

  async listRecurringExpenses(companyId: string) {
    return this.prisma.client.recurringExpenseTemplate.findMany({
      where: { companyId },
      include: { category: { select: { name: true } } },
      orderBy: { description: 'asc' },
    });
  }

  async createRecurringExpense(companyId: string, userId: string, dto: CreateRecurringExpenseDto) {
    const category = await this.prisma.client.expenseCategory.findFirst({
      where: { id: dto.categoryId, companyId },
    });
    if (!category) throw new NotFoundException('Categoria de despesa não encontrada.');

    const template = await this.prisma.client.recurringExpenseTemplate.create({
      data: {
        companyId,
        categoryId: dto.categoryId,
        description: dto.description,
        amount: dto.amount,
        dayOfMonth: dto.dayOfMonth,
        paymentMethod: dto.paymentMethod ?? null,
      },
    });

    await this.audit.log({
      companyId,
      userId,
      action: 'CREATE',
      entity: 'recurring_expense_template',
      entityId: template.id,
      newValue: template,
    });

    return template;
  }

  async setRecurringExpenseActive(companyId: string, id: string, userId: string, isActive: boolean) {
    const existing = await this.prisma.client.recurringExpenseTemplate.findFirst({
      where: { id, companyId },
    });
    if (!existing) throw new NotFoundException('Despesa recorrente não encontrada.');

    const updated = await this.prisma.client.recurringExpenseTemplate.update({
      where: { id },
      data: { isActive },
    });

    await this.audit.log({
      companyId,
      userId,
      action: 'UPDATE',
      entity: 'recurring_expense_template',
      entityId: id,
      oldValue: existing,
      newValue: updated,
    });

    return updated;
  }

  /**
   * Garante, de forma idempotente, que exista uma Expense para cada template ativo na
   * competência atual — chamado pelo job agendado (ver RecurringExpenseSchedulerService).
   * Nunca gera lançamentos futuros antecipadamente.
   */
  async materializeRecurringExpenses(): Promise<number> {
    const now = new Date();
    const competenceDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const templates = await this.prisma.client.recurringExpenseTemplate.findMany({
      where: { isActive: true },
    });

    let created = 0;
    for (const template of templates) {
      const existing = await this.prisma.client.expense.findFirst({
        where: { recurringTemplateId: template.id, competenceDate },
      });
      if (existing) continue;

      const day = Math.min(template.dayOfMonth, 28);
      const dueDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day));

      await this.prisma.client.expense.create({
        data: {
          companyId: template.companyId,
          categoryId: template.categoryId,
          description: template.description,
          amount: template.amount,
          date: dueDate,
          competenceDate,
          status: 'PENDING',
          paymentMethod: template.paymentMethod,
          isRecurring: true,
          recurringTemplateId: template.id,
        },
      });
      created += 1;
    }
    return created;
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
