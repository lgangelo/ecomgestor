/* eslint-disable no-console */
/**
 * CLI para criar o primeiro usuário administrador.
 *
 * Uso:
 *   npm run create-admin -- --email admin@empresa.com --company "Minha Empresa"
 *   npm run create-admin -- --email admin@empresa.com --password "SenhaForte#2026" --company "Minha Empresa"
 *
 * Se --password não for informado, uma senha aleatória forte é gerada e exibida
 * uma única vez no terminal. Nunca existe senha padrão fixa no código.
 */
import { PrismaClient, RoleName } from '@ecommerce-manager/database';
import { ALL_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, ROLE_NAMES } from '@ecommerce-manager/shared';
import { generateRandomPassword, hashPassword, isPasswordStrongEnough } from '@ecommerce-manager/shared-server';

const prisma = new PrismaClient();

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      args[key] = value;
    }
  }
  return args;
}

async function ensureRolesAndPermissions() {
  const permissionIds = new Map<string, string>();
  for (const key of ALL_PERMISSIONS) {
    const perm = await prisma.permission.upsert({ where: { key }, update: {}, create: { key } });
    permissionIds.set(key, perm.id);
  }
  const roleIds = new Map<RoleName, string>();
  for (const name of ROLE_NAMES) {
    const role = await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
    roleIds.set(name, role.id);
    for (const key of DEFAULT_ROLE_PERMISSIONS[name]) {
      const permissionId = permissionIds.get(key);
      if (!permissionId) continue;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId } },
        update: {},
        create: { roleId: role.id, permissionId },
      });
    }
  }
  return roleIds;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const email = args.email ?? process.env.ADMIN_EMAIL;
  const companyName = args.company ?? process.env.ADMIN_COMPANY_NAME;

  if (!email) {
    console.error('Informe --email <email> (ou defina ADMIN_EMAIL).');
    process.exitCode = 1;
    return;
  }

  let password = args.password ?? process.env.ADMIN_PASSWORD;
  let generated = false;
  if (!password) {
    password = generateRandomPassword();
    generated = true;
  } else if (!isPasswordStrongEnough(password)) {
    console.error(
      'Senha fraca: use ao menos 12 caracteres combinando maiúsculas, minúsculas, números e símbolos.',
    );
    process.exitCode = 1;
    return;
  }

  const roleIds = await ensureRolesAndPermissions();

  let company = companyName
    ? await prisma.company.findFirst({ where: { name: companyName } })
    : await prisma.company.findFirst();

  if (!company) {
    company = await prisma.company.create({
      data: { name: companyName ?? 'Minha Empresa' },
    });
    console.log(`Empresa criada: ${company.name} (${company.id})`);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.error(`Já existe um usuário com o e-mail ${email}.`);
    process.exitCode = 1;
    return;
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      companyId: company.id,
      name: args.name ?? 'Administrador',
      email,
      passwordHash,
      isActive: true,
    },
  });

  await prisma.userRole.create({
    data: { userId: user.id, roleId: roleIds.get('ADMIN')! },
  });

  console.log('----------------------------------------------------');
  console.log('Usuário administrador criado com sucesso.');
  console.log(`E-mail: ${email}`);
  if (generated) {
    console.log(`Senha gerada (copie agora, não será exibida novamente): ${password}`);
  }
  console.log('----------------------------------------------------');
}

main()
  .catch((err) => {
    console.error('Erro ao criar administrador:', err.message ?? err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
