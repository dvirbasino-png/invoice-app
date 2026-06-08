"use client"
import { useState } from "react"
import styles from "./HistoryTab.module.css"

const SHEETS_ID = "1qnPwqq9DLOehT_j6ZpbI45VM54s4W3fBJDtQzH_GVdE"

interface HistoryRow {
  date: string
  supplier: string
  inv_no: string
  currency: string
  amount: string
  description: string
  payment_status: string
}

interface Props {
  sheetsId: string
  callClaude: (msgs: any[], tokens?: number) => Promise<any>
  extractText: (data: any) => string
  parseJSON: (text: string) => any
}

export default function HistoryTab({ callClaude, extractText, parseJSON }: Props) {
  const [rows, setRows] = useState<HistoryRow[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState("")
  const [search, setSearch] = useState("")

  const currentSheet = (() => {
    const now = new Date()
    return `${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getFullYear()).slice(2)}`
  })()

  const loadHistory = async () => {
    setLoading(true)
    setError("")
    try {
      const data = await callClaude([{ role: "user", content:
        `Read all rows from Google Sheets ID "${SHEETS_ID}", tab "${currentSheet}".
Return ONLY a JSON array of objects with these fields:
date, supplier, inv_no, currency, amount, description, payment_status
Return max 100 rows. If tab doesn't exist return [].` }], 4000)
      const parsed = parseJSON(extractText(data))
      if (Array.isArray(parsed)) {
        setRows(parsed)
        setLoaded(true)
      } else {
        setError("Could not load history from Sheets.")
      }
    } catch (e: any) { setError(e.message) }
    setLoading(false)
  }

  const filtered = rows.filter(r =>
    !search || r.supplier?.toLowerCase().includes(search.toLowerCase()) || r.inv_no?.includes(search)
  )

  return (
    <div>
      <div className={styles.toolbar}>
        <h1 className={`${styles.title} playfair`}>History — {currentSheet}</h1>
        <button className={styles.btnPrimary} onClick={loadHistory} disabled={loading}>
          {loading ? "Loading..." : loaded ? "⟳ Refresh" : "Load history"}
        </button>
      </div>

      {loaded && (
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search supplier or invoice no..." className={styles.search} />
      )}

      {error && <p className={styles.error}>{error}</p>}

      {!loaded && !loading && !error && (
        <div className={styles.empty}>
          <p className={styles.emptyIcon}>📋</p>
          <p className={`${styles.emptyTitle} playfair`}>History from Sheets</p>
          <p className={styles.emptySub}>Shows all invoices logged this month ({currentSheet})</p>
        </div>
      )}

      {loaded && filtered.length === 0 && (
        <p className={styles.emptySub} style={{ textAlign: "center", padding: "2rem 0" }}>
          {search ? "No results for this search." : "No invoices found in this sheet tab."}
        </p>
      )}

      {filtered.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Supplier</th>
                <th>Invoice No</th>
                <th>Currency</th>
                <th>Amount</th>
                <th>Description</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={i}>
                  <td>{r.date || "—"}</td>
                  <td className={styles.supplierCell}>{r.supplier || "—"}</td>
                  <td style={{ color: "#888780" }}>{r.inv_no || "—"}</td>
                  <td>{r.currency || "—"}</td>
                  <td style={{ color: "#0F6E56", fontWeight: 500 }}>{r.amount || "—"}</td>
                  <td style={{ color: "#5F5E5A" }}>{r.description || "—"}</td>
                  <td>
                    <span className={`${styles.badge} ${r.payment_status === "Paid" ? styles.badgePaid : styles.badgePending}`}>
                      {r.payment_status || "—"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
