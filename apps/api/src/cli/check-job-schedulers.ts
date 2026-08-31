/* eslint-disable no-console */
/**
 * Lista TODOS os agendamentos registrados na fila `integration` — tanto os do mecanismo novo
 * (`upsertJobScheduler`) quanto os do antigo (`queue.add` com `repeat`), pra confirmar de forma
 * direta (sem inferir pelo horário de execução) se existe mais de um agendamento de reconciliação
 * ativo ao mesmo tempo — o padrão de horários "31/08 20:30, 20:33, 20:35, 20:38, 20:40" (gaps de
 * 2-3 min em vez de 5 fixos) é exatamente o que dois agendamentos de 5 em 5 min entrelaçados
 * produziriam, mas só um dump direto confirma se ainda existem dois agora.
 *
 * Uso:
 *   npm run check-job-schedulers
 */
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { INTEGRATION_QUEUE } from '../queue/tiktok-queue.constants';

async function main() {
  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue(INTEGRATION_QUEUE, { connection });

  try {
    const schedulers = await queue.getJobSchedulers();
    console.log(`Job schedulers (mecanismo novo) registrados: ${schedulers.length}`);
    for (const s of schedulers) {
      console.log(`  id=${s.id} name=${s.name} every=${s.every ?? '—'} pattern=${s.pattern ?? '—'} next=${s.next ? new Date(s.next).toISOString() : '—'}`);
    }

    const legacy = await queue.getRepeatableJobs();
    console.log(`Repeatable jobs (mecanismo antigo) registrados: ${legacy.length}`);
    for (const j of legacy) {
      console.log(`  id=${j.id ?? '—'} name=${j.name} every=${j.every ?? '—'} cron=${j.pattern ?? '—'} key=${j.key} next=${j.next ? new Date(j.next).toISOString() : '—'}`);
    }
  } finally {
    await queue.close();
    connection.disconnect();
  }
}

main().catch((err) => {
  console.error('Erro:', err.message ?? err);
  process.exitCode = 1;
});
