import type { Config } from '@netlify/functions'

// Daily pipeline snapshot, emailed to the Redantex team.
//
// Runs on Netlify's scheduler rather than a Supabase Edge Function because the
// Supabase CLI is not authenticated for this project — this deploys with the
// ordinary git push.
//
// Required environment variables (set in Netlify, never in the repo):
//   SUPABASE_URL                  same project URL the app uses
//   SUPABASE_SERVICE_ROLE_KEY     reads past RLS; this function has no user session
//   RESEND_API_KEY                https://resend.com
//   SUMMARY_FROM                  e.g. "RDX Hub <hub@yourdomain.com>" (verified sender)
//   SUMMARY_RECIPIENTS            comma-separated addresses

const BOARDS = ['quotes', 'samples', 'orders'] as const
type Board = typeof BOARDS[number]

const BOARD_COLUMNS: Record<Board, string[]> = {
  quotes: ['Requested', 'Quoted', 'Confirmed', 'Declined'],
  samples: ['Requested', 'In Preparation', 'Under Revision', 'Approved'],
  orders: ['Placed', 'In Production', 'Ready to Ship', 'Shipped'],
}

const BOARD_LABEL: Record<Board, string> = {
  quotes: 'Quotes',
  samples: 'Samples',
  orders: 'Orders',
}

interface CardRow {
  board: Board
  status: string
  value_usd: number | null
}

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing environment variable ${name}`)
  return value
}

async function loadCards(): Promise<CardRow[]> {
  const url = required('SUPABASE_URL')
  const key = required('SUPABASE_SERVICE_ROLE_KEY')

  const response = await fetch(
    `${url}/rest/v1/cards?select=board,status,value_usd&archived=eq.false`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  )
  if (!response.ok) {
    throw new Error(`Supabase returned ${response.status}: ${await response.text()}`)
  }
  return response.json()
}

const money = (n: number) =>
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function buildEmail(cards: CardRow[], today: string) {
  const counts = new Map<string, number>()
  for (const card of cards) counts.set(`${card.board}|${card.status}`, (counts.get(`${card.board}|${card.status}`) ?? 0) + 1)

  // Value still in play: everything on the orders board that has not shipped.
  const inProduction = cards
    .filter(c => c.board === 'orders' && c.status !== 'Shipped')
    .reduce((sum, c) => sum + (c.value_usd ?? 0), 0)

  const totals: Record<Board, number> = {
    quotes: cards.filter(c => c.board === 'quotes').length,
    samples: cards.filter(c => c.board === 'samples').length,
    orders: cards.filter(c => c.board === 'orders').length,
  }

  const section = (board: Board) => {
    const rows = BOARD_COLUMNS[board].map(status => {
      const n = counts.get(`${board}|${status}`) ?? 0
      return `
        <tr>
          <td style="padding:7px 0;border-bottom:1px solid #eceef1;font-size:14px;color:${n ? '#1a1d23' : '#9aa1ab'}">${status}</td>
          <td style="padding:7px 0;border-bottom:1px solid #eceef1;font-size:14px;text-align:right;font-weight:${n ? 600 : 400};color:${n ? '#1a1d23' : '#9aa1ab'}">${n}</td>
        </tr>`
    }).join('')

    return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 26px">
        <tr>
          <td style="padding-bottom:6px">
            <span style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#8b1a1a">${BOARD_LABEL[board]}</span>
            <span style="font-size:12px;color:#9aa1ab"> · ${totals[board]} total</span>
          </td>
        </tr>
        <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr>
      </table>`
  }

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f5f6f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e3e6ea;border-radius:10px">
        <tr><td style="padding:26px 28px 20px;border-bottom:1px solid #eceef1">
          <div style="font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#8b1a1a">Redantex · Supplier Hub</div>
          <div style="font-size:20px;font-weight:650;color:#1a1d23;margin-top:5px">Daily pipeline</div>
          <div style="font-size:13px;color:#6b727d;margin-top:2px">${today}</div>
        </td></tr>

        <tr><td style="padding:22px 28px 4px">
          <div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6b727d">In production</div>
          <div style="font-size:30px;font-weight:700;color:#1a1d23;margin-top:3px">${money(inProduction)}</div>
          <div style="font-size:12px;color:#9aa1ab;margin-top:1px">across ${cards.filter(c => c.board === 'orders' && c.status !== 'Shipped').length} order(s) not yet shipped</div>
        </td></tr>

        <tr><td style="padding:24px 28px 6px">
          ${section('orders')}
          ${section('samples')}
          ${section('quotes')}
        </td></tr>

        <tr><td style="padding:6px 28px 26px;border-top:1px solid #eceef1">
          <div style="font-size:12px;color:#9aa1ab;padding-top:14px">
            Archived cards are excluded. Sent automatically each morning.
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`

  const text = [
    `Redantex — Daily pipeline · ${today}`,
    '',
    `In production: ${money(inProduction)}`,
    '',
    ...BOARDS.flatMap(board => [
      `${BOARD_LABEL[board]} (${totals[board]})`,
      ...BOARD_COLUMNS[board].map(s => `  ${s}: ${counts.get(`${board}|${s}`) ?? 0}`),
      '',
    ]),
  ].join('\n')

  return { html, text }
}

export default async () => {
  const cards = await loadCards()

  const today = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date())

  const { html, text } = buildEmail(cards, today)

  const recipients = required('SUMMARY_RECIPIENTS').split(',').map(s => s.trim()).filter(Boolean)
  if (recipients.length === 0) throw new Error('SUMMARY_RECIPIENTS is empty')

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${required('RESEND_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: required('SUMMARY_FROM'),
      to: recipients,
      subject: `Redantex — Daily pipeline · ${today}`,
      html,
      text,
    }),
  })

  if (!response.ok) {
    // Surfacing the provider's reason here is the difference between a fixable
    // report and a scheduled job that quietly stops arriving.
    const detail = await response.text()
    throw new Error(`Resend returned ${response.status}: ${detail}`)
  }

  return new Response(JSON.stringify({ sent: recipients.length, cards: cards.length }), {
    headers: { 'Content-Type': 'application/json' },
  })
}

// 11:00 UTC — 08:00 in São Paulo, before the working day starts.
export const config: Config = {
  schedule: '0 11 * * *',
}
