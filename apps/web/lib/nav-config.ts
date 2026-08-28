import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Wallet,
  FileText,
  BarChart3,
  Plug,
  Settings,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  permission?: string;
}

export interface NavGroup {
  label: string;
  icon: LucideIcon;
  href?: string;
  permission?: string;
  items?: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  { label: 'Dashboard', icon: LayoutDashboard, href: '/', permission: 'report.read' },
  {
    label: 'Vendas',
    icon: ShoppingCart,
    permission: 'order.read',
    items: [
      { label: 'Pedidos', href: '/vendas/pedidos', permission: 'order.read' },
      { label: 'Nova venda', href: '/vendas/nova', permission: 'order.create' },
      { label: 'Devoluções', href: '/vendas/devolucoes', permission: 'order.read' },
      { label: 'Canais', href: '/vendas/canais', permission: 'order.read' },
    ],
  },
  {
    label: 'Produtos',
    icon: Package,
    permission: 'product.read',
    items: [
      { label: 'Produtos', href: '/produtos', permission: 'product.read' },
      { label: 'Categorias', href: '/produtos/categorias', permission: 'product.read' },
      { label: 'Estoque', href: '/produtos/estoque', permission: 'inventory.read' },
      { label: 'Entradas', href: '/produtos/entradas', permission: 'inventory.read' },
      { label: 'Movimentações', href: '/produtos/movimentacoes', permission: 'inventory.read' },
    ],
  },
  {
    label: 'Financeiro',
    icon: Wallet,
    permission: 'finance.read',
    items: [
      { label: 'Visão geral', href: '/financeiro', permission: 'finance.read' },
      { label: 'Receitas', href: '/financeiro/receitas', permission: 'finance.read' },
      { label: 'Despesas', href: '/financeiro/despesas', permission: 'finance.read' },
      { label: 'Taxas', href: '/financeiro/taxas', permission: 'finance.read' },
      { label: 'Fechamento mensal', href: '/financeiro/fechamento', permission: 'finance.read' },
    ],
  },
  {
    label: 'Fiscal',
    icon: FileText,
    permission: 'fiscal.read',
    items: [
      { label: 'Documentos fiscais', href: '/fiscal', permission: 'fiscal.read' },
      { label: 'Exportação de XML', href: '/fiscal/exportacao', permission: 'fiscal.read' },
    ],
  },
  { label: 'Relatórios', icon: BarChart3, href: '/relatorios', permission: 'report.read' },
  {
    label: 'Integrações',
    icon: Plug,
    permission: 'integration.read',
    items: [
      { label: 'TikTok Shop', href: '/integracoes/tiktok', permission: 'integration.read' },
      { label: 'Shopee', href: '/integracoes/shopee', permission: 'integration.read' },
      { label: 'Mercado Livre', href: '/integracoes/mercado-livre', permission: 'integration.read' },
    ],
  },
  {
    label: 'Configurações',
    icon: Settings,
    permission: 'settings.manage',
    items: [
      { label: 'Empresa', href: '/configuracoes/empresa', permission: 'settings.manage' },
      { label: 'Usuários', href: '/configuracoes/usuarios', permission: 'users.manage' },
      { label: 'Permissões', href: '/configuracoes/permissoes', permission: 'users.manage' },
      { label: 'Auditoria', href: '/configuracoes/auditoria', permission: 'audit.read' },
    ],
  },
];
