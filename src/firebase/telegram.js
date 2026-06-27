const BOT_TOKEN = import.meta.env.VITE_TELEGRAM_BOT_TOKEN
const CHAT_ID   = import.meta.env.VITE_TELEGRAM_CHAT_ID

function formatTime(date = new Date()) {
  return date.toLocaleString('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true
  })
}

function buildMessage({ type, emoji, message, action }) {
  return [
    `━━━━━━━━━━━━━━━━`,
    `🏆 GOLD PODIUM`,
    `━━━━━━━━━━━━━━━━`,
    `${emoji} Type    : ${type}`,
    `📋 Message : ${message}`,
    `⏰ Time    : ${formatTime()}`,
    `⚡ Action  : ${action}`,
    `━━━━━━━━━━━━━━━━`,
  ].join('\n')
}

async function sendAlert({ type, emoji, message, action }) {
  if (!BOT_TOKEN || !CHAT_ID ||
      BOT_TOKEN === 'ISI_TOKEN_BOT_KAMU_DI_SINI' ||
      CHAT_ID   === 'ISI_CHAT_ID_KAMU_DI_SINI') return

  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: buildMessage({ type, emoji, message, action }),
        parse_mode: 'HTML'
      })
    })
  } catch {
    // Telegram gagal — jangan crash app
  }
}

// ── CRITICAL ──────────────────────────────────────────────────
export const alertFailedLogin = (email) =>
  sendAlert({
    type: 'CRITICAL', emoji: '🚨',
    message: `Failed login 5x\n             ${email}`,
    action: 'Check security logs'
  })

export const alertRuleBreach = (uid, path) =>
  sendAlert({
    type: 'CRITICAL', emoji: '🚨',
    message: `Firestore rules breach attempt\n             UID: ${uid} | Path: ${path}`,
    action: 'Check security logs immediately'
  })

export const alertSystemError = (error) =>
  sendAlert({
    type: 'CRITICAL', emoji: '🚨',
    message: `System error detected\n             ${error}`,
    action: 'Check error logs'
  })

export const alertSuperadminNewDevice = (email) =>
  sendAlert({
    type: 'CRITICAL', emoji: '🚨',
    message: `Superadmin login from new device\n             ${email}`,
    action: 'Verify if this is you'
  })

// ── WARNING ───────────────────────────────────────────────────
export const alertNewSchool = (schoolName) =>
  sendAlert({
    type: 'WARNING', emoji: '🟡',
    message: `New school registered\n             ${schoolName}`,
    action: 'Review & activate in Superadmin panel'
  })

export const alertSubscriptionExpiring = (schoolName, days) =>
  sendAlert({
    type: 'WARNING', emoji: '🟡',
    message: `Subscription expiring in ${days} days\n             ${schoolName}`,
    action: 'Contact school for renewal'
  })

export const alertSuspiciousWrite = (uid) =>
  sendAlert({
    type: 'WARNING', emoji: '🟡',
    message: `Suspicious write pattern detected\n             UID: ${uid}`,
    action: 'Check security logs'
  })

// ── INFO ──────────────────────────────────────────────────────
export const alertPaymentReceived = (schoolName, plan) =>
  sendAlert({
    type: 'INFO', emoji: '🟢',
    message: `New payment received\n             ${schoolName} — Plan: ${plan}`,
    action: 'Activate subscription'
  })

export const alertDailySummary = (stats) =>
  sendAlert({
    type: 'INFO', emoji: '🟢',
    message: `Daily Summary\n             Schools: ${stats.total} | Active: ${stats.active} | Revenue: RM${stats.revenue}`,
    action: 'No action needed'
  })
