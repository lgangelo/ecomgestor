// Barrel "navegador-seguro": nada aqui pode depender de módulos nativos do Node
// (ex: argon2). Utilitários que dependem de Node ficam em ./server, importado
// separadamente apenas pelo backend/scripts (ver @ecommerce-manager/shared/server).
export * from './permissions';
export * from './money';
export * from './constants';
