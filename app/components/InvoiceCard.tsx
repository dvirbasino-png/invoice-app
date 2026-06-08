"use client"
import { useState, useEffect } from "react"
import { Invoice } from "../page"
import styles from "./InvoiceCard.module.css"

function defaultSheet(sheets: string[]) {
  const now = new Date()
  const guess = `${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getFullYear()).slice(2)}`
  return sheets.includes(guess) ? guess : (sheets[sheets.length - 1] || guess)
}

function supplierColor(supplier: string) {
  const colors = [
    { bg: "#E6F1FB", color: "#185FA5" },
    { bg: "#E1F5EE", color: "#0F6E56" },
    { bg: "#FAEEDA", color: "#854F0B" },
    { bg: "#EEEDFE", color: "#534AB7" },
  ]
  let h = 0
  for (let i = 0; i < (supplier || "").length; i++) h = (h * 31 + supplier.charCodeAt(i)) & 0xffff
  return colors[h % 4]
}

function fmtAmount(amount: number, currency: string) {
  const n = Number(amount).toLocaleString()
  if (["ILS","NIS"].includes(currency)) return `₪${n}`
  if (currency === "EUR") return `€${n}`
  if (currency === "GBP") return `£${n}`
  return `$${n}`
}

interface Props {
  invoice: Invoice
  sheets: string[]
  sheetsLoading: boolean
  activePanel: string | null
  onSetPanel: (p: string | null) => void
  onAction: (action: string, opts?: any) => void
}

export default function InvoiceCard({ invoice, sheets, sheetsLoading, activePanel, onSetPanel, onAction }: Props) {
  const { status } = invoice
  const initials = (invoice.supplier || "??").split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase()
  const c = supplierColor(invoice.supplier)
  const [skipConfirm, setSkipConfirm] = useState(false)

  const borderColor = activePanel === "upload" ? "#2D6A4F"
    : activePanel === "forward" ? "#185FA5"
    : status === "uploaded" ? "#0F6E56"
    : status === "hold" ? "#E8C84A"
    : "rgba(45,106,79,0.15)"

  const borderWidth = status === "hold" || activePanel ? "1px" : "0.5px"

  return (
    <div className={styles.card} style={{ border: `${borderWidth} solid ${borderColor}`, opacity: status === "uploaded" ? 0.6 : 1 }}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.avatar} style={{ background: c.bg, color: c.color }}>{initials}</div>
          <div>
            <p className={styles.supplier}>{invoice.supplier}</p>
            <p className={styles.meta}>{invoice.inv_no || "—"} · {invoice.date || "—"}</p>
          </div>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* Hold note */}
      {status === "hold" && !activePanel && (
        <div className={styles.holdNote}>
          ⏳ On hold{invoice.approval_target ? ` — awaiting approval from ${invoice.approval_target}` : ""}
        </div>
      )}

      {/* Fields */}
      <div className={styles.fields}>
        {[["Date", invoice.date], ["Currency", invoice.currency], ["Amount", fmtAmount(invoice.amount, invoice.currency)], ["Description", invoice.description], ...(invoice.notes ? [["Notes", invoice.notes]] : [])].map(([l, v]) => (
          <div key={l}><p className={styles.fl}>{l}</p><p className={styles.fv} style={l === "Amount" ? { color: "#0F6E56" } : {}}>{v || "—"}</p></div>
        ))}
      </div>

      {/* Actions */}
      {!activePanel && (
        <>
          {(status === "pending" || status === "hold") && (
            <div className={styles.actions}>
              <button className={`${styles.btn} ${styles.btnUpload}`} onClick={() => { setSkipConfirm(false); onSetPanel("upload") }}>⬆ Drive + Sheets</button>
              <button className={`${styles.btn} ${styles.btnFwd}`} onClick={() => { setSkipConfirm(false); onSetPanel("forward") }}>↗ Forward</button>
              {status === "pending" && (
                <button className={`${styles.btn} ${styles.btnHold}`} onClick={() => { setSkipConfirm(false); onSetPanel("hold_panel") }}>⏳ Needs approval</button>
              )}
              {status === "hold" && (
                <button className={`${styles.btn} ${styles.btnRemove}`} onClick={() => onAction("remove_hold")}>✕ Remove hold</button>
              )}
              {status === "pending" && (
                !skipConfirm
                  ? <button className={`${styles.btn} ${styles.btnSkip}`} onClick={() => setSkipConfirm(true)}>✕ Skip</button>
                  : <span className={styles.skipConfirm}>
                      Sure? <button className={`${styles.btn} ${styles.btnSkipConfirm}`} onClick={() => onAction("skip")}>Yes, skip</button>
                      <button className={`${styles.btn} ${styles.btnRemove}`} onClick={() => setSkipConfirm(false)}>Cancel</button>
                    </span>
              )}
            </div>
          )}

          {status === "uploaded" && (
            <div>
              <p className={styles.uploadedMsg}>
                ✓ Uploaded
                {invoice.upload_result?.drive_ok ? " · 📁 Drive ✓" : " · 📁 Drive ⚠️"}
                {invoice.upload_result?.sheets_ok ? ` · 📊 Sheets ✓ — ${invoice.upload_result.sheet_name}` : " · 📊 Sheets ⚠️"}
                {invoice.upload_result?.drive_url && <a href={invoice.upload_result.drive_url} target="_blank" rel="noreferrer" className={styles.driveLink}> Open ↗</a>}
              </p>
              {(!invoice.upload_result?.drive_ok || !invoice.upload_result?.sheets_ok) && (
                <button className={`${styles.btn} ${styles.btnHold}`} style={{ marginTop: 8 }} onClick={() => onSetPanel("upload")}>🔄 Retry failed</button>
              )}
            </div>
          )}

          {status === "skipped" && (
            <div className={styles.actions}>
              <span className={styles.skippedMsg}>Skipped</span>
              <button className={`${styles.btn} ${styles.btnRemove}`} onClick={() => onAction("undo_skip")}>Undo</button>
            </div>
          )}
        </>
      )}

      {/* Upload panel */}
      {activePanel === "upload" && (
        <UploadPanel invoice={invoice} sheets={sheets} sheetsLoading={sheetsLoading} onConfirm={opts => onAction("confirm_upload", opts)} onCancel={() => onSetPanel(null)} />
      )}

      {/* Forward panel */}
      {activePanel === "forward" && (
        <ForwardPanel invoice={invoice} onClose={() => onSetPanel(null)} />
      )}

      {/* Hold panel */}
      {activePanel === "hold_panel" && (
        <HoldPanel onConfirm={opts => { onAction("hold", opts); onSetPanel(null) }} onCancel={() => onSetPanel(null)} />
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; bg: string; color: string; border?: string }> = {
    pending: { label: "Pending", bg: "#FAEEDA", color: "#854F0B" },
    hold: { label: "⏳ On hold", bg: "#FFF8E1", color: "#8B6914", border: "1px solid #E8C84A" },
    uploaded: { label: "✓ Uploaded", bg: "#E1F5EE", color: "#0F6E56" },
    skipped: { label: "Skipped", bg: "#F1EFE8", color: "#5F5E5A" },
  }
  const c = cfg[status] || cfg.pending
  return <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 100, fontWeight: 500, whiteSpace: "nowrap", background: c.bg, color: c.color, border: c.border || "none" }}>{c.label}</span>
}

function EditField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <p style={{ margin: "0 0 3px", fontSize: 11, color: "#888780" }}>{label}</p>
      <input value={value} onChange={e => onChange(e.target.value)} style={{ width: "100%", padding: "5px 8px", borderRadius: 6, border: "0.5px solid rgba(45,106,79,0.3)", fontSize: 13, boxSizing: "border-box", background: "white", fontFamily: "DM Sans, sans-serif" }} />
    </div>
  )
}

function UploadPanel({ invoice, sheets, sheetsLoading, onConfirm, onCancel }: { invoice: Invoice; sheets: string[]; sheetsLoading: boolean; onConfirm: (opts: any) => void; onCancel: () => void }) {
  const def = defaultSheet(sheets)
  const [sheet, setSheet] = useState(def)
  const [folderChoice, setFolderChoice] = useState("existing")
  const [newFolderName, setNewFolderName] = useState(invoice.supplier)
  const [editOpen, setEditOpen] = useState(false)
  const [fields, setFields] = useState({
    supplier: invoice.supplier || "",
    inv_no: invoice.inv_no || "",
    company_number: invoice.company_number || "",
    invoice_date: invoice.invoice_date || invoice.date || "",
    date: invoice.date || "",
    currency: invoice.currency || "NIS",
    amount: String(invoice.amount || ""),
    description: invoice.description || "",
    notes: invoice.notes || "",
  })
  const upd = (k: string, v: string) => setFields(f => ({ ...f, [k]: v }))
  useEffect(() => { setSheet(defaultSheet(sheets)) }, [sheets.length])

  return (
    <div className={styles.panel} style={{ borderColor: "#2D6A4F" }}>
      <div className={styles.panelHeader}>
        <p className={styles.panelTitle}>⬆ Confirm upload</p>
        <button onClick={onCancel} className={styles.panelClose}>×</button>
      </div>
      <div className={styles.panelSummary}>
        <strong>{fields.supplier}</strong>
        {fields.inv_no && <span style={{ color: "#888780" }}> #{fields.inv_no}</span>}
        <span style={{ color: "#888780" }}> · {fields.currency} {fields.amount}</span>
      </div>
      <button onClick={() => setEditOpen(o => !o)} className={styles.editToggle}>✏️ {editOpen ? "Close edit" : "Edit fields"}</button>
      {editOpen && (
        <div className={styles.editGrid}>
          <EditField label="Supplier" value={fields.supplier} onChange={v => upd("supplier", v)} />
          <EditField label="Invoice No" value={fields.inv_no} onChange={v => upd("inv_no", v)} />
          <EditField label="Company No" value={fields.company_number} onChange={v => upd("company_number", v)} />
          <EditField label="Invoice Date" value={fields.invoice_date} onChange={v => upd("invoice_date", v)} />
          <EditField label="Currency" value={fields.currency} onChange={v => upd("currency", v)} />
          <EditField label="Amount" value={fields.amount} onChange={v => upd("amount", v)} />
          <div style={{ gridColumn: "1 / -1" }}><EditField label="Description" value={fields.description} onChange={v => upd("description", v)} /></div>
          <div style={{ gridColumn: "1 / -1" }}><EditField label="Notes" value={fields.notes} onChange={v => upd("notes", v)} /></div>
        </div>
      )}
      <div className={styles.panelDivider} />
      <p className={styles.panelSectionLabel}>Target sheet</p>
      {sheetsLoading ? <p style={{ fontSize: 12, color: "#888780" }}>Loading sheets...</p> : (
        <select value={sheet} onChange={e => setSheet(e.target.value)} className={styles.select}>
          {(sheets.length > 0 ? sheets : [def]).map(m => <option key={m} value={m}>{m}{m === def ? " ← current" : ""}</option>)}
        </select>
      )}
      <div className={styles.panelDivider} />
      <p className={styles.panelSectionLabel}>Drive folder</p>
      <div className={styles.folderBtns}>
        <button onClick={() => setFolderChoice("existing")} className={`${styles.folderBtn} ${folderChoice === "existing" ? styles.folderBtnActive : ""}`}>📁 Existing</button>
        <button onClick={() => setFolderChoice("new")} className={`${styles.folderBtn} ${folderChoice === "new" ? styles.folderBtnActiveBlue : ""}`}>✨ New folder</button>
      </div>
      {folderChoice === "existing" && <p style={{ fontSize: 12, color: "#888780", margin: "4px 0 0" }}>Will search for folder named "{fields.supplier}"</p>}
      {folderChoice === "new" && <input value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="Folder name" className={styles.input} style={{ marginTop: 6 }} />}
      <div className={styles.panelDivider} />
      <div className={styles.panelActions}>
        <button onClick={onCancel} className={`${styles.btn} ${styles.btnRemove}`}>Cancel</button>
        <button onClick={() => onConfirm({ sheet, folderChoice, newFolderName, fields })} className={`${styles.btn} ${styles.btnUpload}`}>⬆ Upload</button>
      </div>
    </div>
  )
}

function ForwardPanel({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const [email, setEmail] = useState("")
  const [sent, setSent] = useState(false)
  const TARGETS = [
    { label: "Bill.com", email: "vegasecurityinc@bill.com" },
    { label: "Dokka", email: "zensand13@dokka.co.il" },
    { label: "MeshPay", email: "vegaLTD@meshpay.me" },
  ]
  if (sent) return <div className={styles.panel} style={{ borderColor: "#0F6E56", background: "#E1F5EE" }}><p style={{ fontSize: 13, color: "#0F6E56" }}>✓ Forwarded to {email}</p></div>
  return (
    <div className={styles.panel} style={{ borderColor: "#185FA5" }}>
      <div className={styles.panelHeader}>
        <p className={styles.panelTitle}>↗ Forward invoice</p>
        <button onClick={onClose} className={styles.panelClose}>×</button>
      </div>
      <div className={styles.quickTargets}>
        {TARGETS.map(t => (
          <button key={t.label} className={`${styles.btn} ${styles.btnFwd} ${email === t.email ? styles.btnFwdActive : ""}`} onClick={() => setEmail(t.email)}>{t.label}</button>
        ))}
      </div>
      <p style={{ fontSize: 12, color: "#888780", margin: "8px 0 4px" }}>Or enter an address:</p>
      <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" className={styles.input} />
      <div className={styles.panelActions} style={{ marginTop: 12 }}>
        <button onClick={onClose} className={`${styles.btn} ${styles.btnRemove}`}>Cancel</button>
        <button disabled={!email.trim()} className={`${styles.btn} ${styles.btnFwd}`} onClick={() => { if (email.trim()) setSent(true) }} style={{ opacity: email.trim() ? 1 : 0.5 }}>↗ Send</button>
      </div>
    </div>
  )
}

function HoldPanel({ onConfirm, onCancel }: { onConfirm: (opts: any) => void; onCancel: () => void }) {
  const [target, setTarget] = useState("")
  const [note, setNote] = useState("")
  return (
    <div className={styles.panel} style={{ borderColor: "#E8C84A", background: "#FFFDF5" }}>
      <div className={styles.panelHeader}>
        <p className={styles.panelTitle} style={{ color: "#8B6914" }}>⏳ Put on hold</p>
        <button onClick={onCancel} className={styles.panelClose}>×</button>
      </div>
      <p style={{ fontSize: 12, color: "#888780", margin: "0 0 5px" }}>Who needs to approve? (optional)</p>
      <input value={target} onChange={e => setTarget(e.target.value)} placeholder="eden@vega.io" className={styles.input} style={{ marginBottom: 8 }} />
      <p style={{ fontSize: 12, color: "#888780", margin: "0 0 5px" }}>Note (optional)</p>
      <input value={note} onChange={e => setNote(e.target.value)} placeholder="Why does this need approval?" className={styles.input} style={{ marginBottom: 12 }} />
      <div className={styles.panelActions}>
        <button onClick={onCancel} className={`${styles.btn} ${styles.btnRemove}`}>Cancel</button>
        <button onClick={() => onConfirm({ target, note })} className={`${styles.btn} ${styles.btnHold}`}>⏳ Put on hold</button>
      </div>
    </div>
  )
}
