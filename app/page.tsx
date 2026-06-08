"use client"
import { useSession, signOut } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useEffect, useState, useCallback } from "react"
import InvoiceCard from "./components/InvoiceCard"
import HistoryTab from "./components/HistoryTab"
import styles from "./page.module.css"

const SHEETS_ID = "1qnPwqq9DLOehT_j6ZpbI45VM54s4W3fBJDtQzH_GVdE"
const DRIVE_PARENT_ID = "18jJACR22tOgo7B-fTDBF30kVwItu8S0Z"

export type InvoiceStatus = "pending" | "hold" | "uploaded" | "skipped"

export interface Invoice {
  id: string
  supplier: string
  inv_no: string
  company_number: string
  invoice_date: string
  date: string
  currency: string
  amount: number
  description: string
  notes: string
  gmail_message_id: string
  attachment_filename: string
  status: InvoiceStatus
  upload_result?: { drive_ok: boolean; sheets_ok: boolean; drive_url?: string; sheet_name?: string; folder?: string }
  last_upload_opts?: any
  approval_target?: string
}

const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "hold", label: "Needs approval" },
  { key: "uploaded", label: "Uploaded" },
  { key: "skipped", label: "Skipped" },
]

async function callClaude(messages: any[], maxTokens = 6000) {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, max_tokens: maxTokens }),
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

function extractText(data: any) {
  return data?.content?.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n") || ""
}

function parseJSON(text: string) {
  try {
    const clean = text.replace(/```json|```/g, "").trim()
    const a = clean.indexOf("["), o = clean.indexOf("{")
    const start = a !== -1 && (o === -1 || a < o) ? a : o
    const end = Math.max(clean.lastIndexOf("}"), clean.lastIndexOf("]"))
    if (start === -1 || end === -1) return null
    return JSON.parse(clean.slice(start, end + 1))
  } catch { return null }
}

function esc(s: any) { return String(s || "").replace(/"/g, '\\"') }

export default function Home() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [sheets, setSheets] = useState<string[]>([])
  const [sheetsLoading, setSheetsLoading] = useState(true)
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState("")
  const [error, setError] = useState("")
  const [lastFetched, setLastFetched] = useState("")
  const [activeFilter, setActiveFilter] = useState("all")
  const [activeTab, setActiveTab] = useState<"pending" | "history">("pending")
  const [activePanels, setActivePanels] = useState<Record<string, string | null>>({})

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login")
  }, [status])

  useEffect(() => {
    if (status !== "authenticated") return
    callClaude([{ role: "user", content: `List all sheet tab names in Google Sheets ID "${SHEETS_ID}". Return ONLY a JSON array, e.g. ["01/25","02/25"].` }])
      .then(d => { const p = parseJSON(extractText(d)); if (Array.isArray(p) && p.length > 0) setSheets(p) })
      .catch(() => {})
      .finally(() => setSheetsLoading(false))

    // Register push notifications
    if ("serviceWorker" in navigator && "PushManager" in window) {
      registerPush()
    }
  }, [status])

  async function registerPush() {
    try {
      const reg = await navigator.serviceWorker.register("/sw.js")
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      })
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      })
    } catch (e) { console.log("Push not available:", e) }
  }

  const fetchInvoices = useCallback(async () => {
    setLoading(true)
    setError("")
    setActivePanels({})
    setLoadingMsg("Scanning bills@vega.io for invoices...")
    try {
      const data = await callClaude([{ role: "user", content:
        `Search Gmail for unread emails in the last 30 days sent to bills@vega.io with PDF attachments.
Look for: invoice, חשבונית, bill, receipt, חשבון in subject or body.
Extract per email: supplier, company_number (ח.פ/עוסק if visible), inv_no, invoice_date (DD/MM/YYYY), date (received DD/MM/YYYY), currency (USD/NIS/ILS/EUR/GBP), amount (final total after VAT, number only), description (brief), notes, gmail_message_id, attachment_filename.
Return ONLY JSON array max 20:
[{"id":"unique","supplier":"","company_number":"","inv_no":"","invoice_date":"","date":"","currency":"NIS","amount":0,"description":"","notes":"","gmail_message_id":"","attachment_filename":"","status":"pending"}]
If none return [].` }])
      const parsed = parseJSON(extractText(data))
      if (Array.isArray(parsed) && parsed.length > 0) {
        setInvoices(parsed)
        setLastFetched(new Date().toLocaleTimeString("en-IL"))
      } else {
        setError("No invoices found in the last 30 days.")
      }
    } catch (e: any) { setError(`Error: ${e.message}`) }
    setLoading(false)
    setLoadingMsg("")
  }, [])

  const updateInvoice = (id: string, patch: Partial<Invoice>) => {
    setInvoices(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i))
  }

  const setPanel = (id: string, panel: string | null) => {
    setActivePanels({ [id]: panel })
  }

  const handleAction = useCallback(async (id: string, action: string, opts?: any) => {
    const inv = invoices.find(i => i.id === id)
    if (!inv) return

    if (action === "hold") { updateInvoice(id, { status: "hold", approval_target: opts?.target || "" }); return }
    if (action === "remove_hold") { updateInvoice(id, { status: "pending" }); return }
    if (action === "skip") { updateInvoice(id, { status: "skipped" }); return }
    if (action === "undo_skip") { updateInvoice(id, { status: "pending" }); return }

    if (action === "confirm_upload") {
      const { sheet, folderChoice, newFolderName, fields, isRetry } = opts
      const folderName = folderChoice === "new" ? newFolderName : fields.supplier
      const prevResult = isRetry ? (inv.upload_result || {}) : {}
      const shouldDrive = isRetry ? !prevResult.drive_ok : true
      const shouldSheets = isRetry ? !prevResult.sheets_ok : true

      setPanel(id, null)

      // Duplicate check
      if (shouldSheets && fields.inv_no?.trim()) {
        updateInvoice(id, { status: "hold" })
        try {
          const dupData = await callClaude([{ role: "user", content:
            `Search Google Sheets ID "${SHEETS_ID}", tab "${esc(sheet)}" for a row where "Invoice No" equals "${esc(fields.inv_no)}" AND "Supplier Name" contains "${esc(fields.supplier)}".
Return JSON: {"duplicate": true} or {"duplicate": false}` }])
          const dup = parseJSON(extractText(dupData))
          if (dup?.duplicate === true) {
            updateInvoice(id, { status: "pending" })
            setError(`⚠️ ${fields.supplier} / ${fields.inv_no} already exists in sheet ${sheet}.`)
            return
          }
        } catch { }
      }

      updateInvoice(id, { status: "hold", last_upload_opts: { sheet, folderChoice, newFolderName, fields } })

      let driveOk = (prevResult as any).drive_ok || false
      let sheetsOk = (prevResult as any).sheets_ok || false
      let driveUrl = (prevResult as any).drive_url || ""

      if (shouldDrive) {
        try {
          const r = parseJSON(extractText(await callClaude([{ role: "user", content:
            `Using Gmail and Drive MCP:
1. Get PDF "${esc(inv.attachment_filename)}" from Gmail message "${inv.gmail_message_id}".
2. Upload to Drive under parent "${DRIVE_PARENT_ID}":
   ${folderChoice === "new" ? `Create subfolder "${esc(folderName)}", upload there.` : `Find or create subfolder "${esc(folderName)}" under parent, upload there.`}
   Filename: "${esc(fields.supplier)}_${esc(fields.inv_no || fields.invoice_date)}.pdf"
3. Return the file web view URL.
Return JSON: {"success": true, "drive_url": "https://drive.google.com/..."}` }])))
          driveOk = r?.success === true
          driveUrl = r?.drive_url || ""
        } catch { driveOk = false }
      }

      if (shouldSheets) {
        try {
          const today = new Date().toLocaleDateString("en-GB")
          const r = parseJSON(extractText(await callClaude([{ role: "user", content:
            `Append row to Google Sheets "${SHEETS_ID}", tab "${esc(sheet)}".
Columns: Entered On Date, Supplier Name, Company Number, Invoice Date, Invoice No, Currency, Total Amount, Description, Notes, Payment Status, אישור ניהול חשבון בנק, אישור ניכוי מס
Values: "${today}", "${esc(fields.supplier)}", "${esc(fields.company_number)}", "${esc(fields.invoice_date || fields.date)}", "${esc(fields.inv_no)}", "${esc(fields.currency)}", "${esc(fields.amount)}", "${esc(fields.description)}", "${esc(fields.notes)}", "Pending", "", ""
Return JSON: {"success": true}` }])))
          sheetsOk = r?.success === true
        } catch { sheetsOk = false }
      }

      const upload_result = { drive_ok: driveOk, sheets_ok: sheetsOk, drive_url: driveUrl, sheet_name: sheet, folder: folderName }
      updateInvoice(id, { status: driveOk || sheetsOk ? "uploaded" : "pending", upload_result })
      if (!driveOk && !sheetsOk) setError(`Failed to upload ${fields.supplier} — neither Drive nor Sheets succeeded.`)
    }
  }, [invoices])

  if (status === "loading") return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#F5F0E8" }}><p style={{ fontFamily: "Playfair Display, serif", color: "#2D6A4F", fontSize: 20 }}>vega</p></div>
  if (!session) return null

  const displayName = session.user?.name || session.user?.email || "User"
  const initials = displayName.split(" ").slice(0, 2).map((w: string) => w[0]).join("").toUpperCase()

  // Stats
  const counts = { pending: 0, hold: 0, uploaded: 0, skipped: 0 }
  invoices.forEach(i => { if (counts[i.status] !== undefined) counts[i.status]++ })
  const done = counts.uploaded + counts.skipped
  const progress = invoices.length > 0 ? Math.round(done / invoices.length * 100) : 0

  // Filter counts
  const filterCounts: Record<string, number> = {
    all: invoices.length,
    pending: counts.pending,
    hold: counts.hold,
    uploaded: counts.uploaded,
    skipped: counts.skipped,
  }

  // Sorted + filtered
  const ORDER: Record<string, number> = { hold: 0, pending: 1, uploaded: 2, skipped: 3 }
  const displayed = invoices
    .filter(i => activeFilter === "all" || i.status === activeFilter)
    .sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9))

  return (
    <div className={styles.app}>
      {/* Nav */}
      <nav className={styles.nav}>
        <span className={`${styles.logo} playfair`}>vega</span>
        <div className={styles.navRight}>
          <span className={styles.userName}>{session.user?.email}</span>
          <div className={styles.avatar} title={displayName}>{initials}</div>
          <button className={styles.signOut} onClick={() => signOut()}>Sign out</button>
        </div>
      </nav>

      {/* Tabs */}
      <div className={styles.tabs}>
        <button className={`${styles.tab} ${activeTab === "pending" ? styles.tabActive : ""}`} onClick={() => setActiveTab("pending")}>Pending</button>
        <button className={`${styles.tab} ${activeTab === "history" ? styles.tabActive : ""}`} onClick={() => setActiveTab("history")}>History</button>
      </div>

      <div className={styles.body}>
        {activeTab === "history" ? (
          <HistoryTab sheetsId={SHEETS_ID} callClaude={callClaude} extractText={extractText} parseJSON={parseJSON} />
        ) : (
          <>
            <div className={styles.toolbar}>
              <h1 className={`${styles.title} playfair`}>Invoice Review</h1>
              <button className={styles.btnPrimary} onClick={fetchInvoices} disabled={loading}>
                {loading ? loadingMsg || "Loading..." : "⟳ Load invoices"}
              </button>
            </div>

            {invoices.length > 0 && (
              <>
                <div className={styles.stats}>
                  {[
                    { label: "Pending", val: counts.pending, color: "#854F0B" },
                    { label: "Uploaded", val: counts.uploaded, color: "#0F6E56" },
                    { label: "On hold", val: counts.hold, color: "#8B6914" },
                    { label: "Total", val: invoices.length, color: "#1B5E42" },
                  ].map(s => (
                    <div className={styles.stat} key={s.label}>
                      <p className={styles.statLabel}>{s.label}</p>
                      <p className={`${styles.statVal} playfair`} style={{ color: s.color }}>{s.val}</p>
                    </div>
                  ))}
                </div>

                <div className={styles.progress}>
                  <div className={styles.progressRow}>
                    <span className={styles.progressLabel}>Progress</span>
                    <span className={styles.progressLabel}>{done} / {invoices.length} done</span>
                  </div>
                  <div className={styles.progressBar}>
                    <div className={styles.progressFill} style={{ width: `${progress}%`, background: progress === 100 ? "#0F6E56" : "#2D6A4F" }} />
                  </div>
                </div>

                <div className={styles.filters}>
                  {FILTERS.map(f => (
                    <button key={f.key} className={`${styles.filter} ${activeFilter === f.key ? styles.filterActive : ""}`} onClick={() => setActiveFilter(f.key)}>
                      {f.label} <span className={styles.filterCount}>{filterCounts[f.key]}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {error && (
              <div className={styles.error}>
                {error}
                <button onClick={() => setError("")} className={styles.errorClose}>✕</button>
              </div>
            )}

            {!loading && invoices.length === 0 && !error && (
              <div className={styles.empty}>
                <p className={styles.emptyIcon}>📬</p>
                <p className={`${styles.emptyTitle} playfair`}>Click "Load invoices" to start</p>
                <p className={styles.emptySub}>Searches bills@vega.io · last 30 days</p>
              </div>
            )}

            <div className={styles.cards}>
              {displayed.map(inv => (
                <InvoiceCard
                  key={inv.id}
                  invoice={inv}
                  sheets={sheets}
                  sheetsLoading={sheetsLoading}
                  activePanel={activePanels[inv.id] || null}
                  onSetPanel={(panel) => setPanel(inv.id, panel)}
                  onAction={(action, opts) => handleAction(inv.id, action, opts)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
