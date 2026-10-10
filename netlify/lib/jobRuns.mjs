/**
 * O batimento das rotinas agendadas.
 *
 * Cada função registra, ao fim de cada execução, que rodou e o que fez. Isso
 * existe para separar duas coisas que o silêncio confunde: a rotina não ter
 * rodado, e a rotina ter rodado e não ter o que fazer — que é o caso normal na
 * maioria dos dias.
 *
 * **Nunca derruba a rotina.** Um batimento que falhasse e quebrasse o envio
 * seria pior do que não ter batimento nenhum: a mesma disciplina de
 * `notify_on_comment`, que engole o próprio erro para que uma notificação
 * jamais seja o motivo de um comentário não salvar. Migração 061.
 */
export async function recordRun({ job, note, ok = true }) {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return

  try {
    const res = await fetch(`${url}/rest/v1/job_runs?on_conflict=job`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        // `merge-duplicates` reescreve a linha da rotina; é uma linha por
        // rotina, não um histórico.
        Prefer: 'return=minimal,resolution=merge-duplicates',
      },
      body: JSON.stringify([{
        job,
        last_run_at: new Date().toISOString(),
        last_ok: ok,
        note: String(note ?? '').slice(0, 300),
      }]),
    })
    if (!res.ok) console.error('job_runs:', res.status, await res.text())
  } catch (err) {
    console.error('job_runs:', err)
  }
}
