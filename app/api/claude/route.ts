import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]/route"

// Fetch emails from Gmail API directly
async function fetchGmailInvoices(accessToken: string) {
  // Search for emails sent to bills@vega.io with PDF attachments in last 30 days
  const thirtyDaysAgo = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000)
  const query = `to:bills@vega.io has:attachment after:${thirtyDaysAgo}`
  
  const searchRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=20`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  const searchData = await searchRes.json()
  
  if (!searchData.messages || searchData.messages.length === 0) return []
  
  // Fetch each message details
  const messages = await Promise.all(
    searchData.messages.slice(0, 15).map(async (msg: any) => {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      const msgData = await msgRes.json()
      
      const headers = msgData.payload?.headers || []
      const subject = headers.find((h: any) => h.name === "Subject")?.value || ""
      const from = headers.find((h: any) => h.name === "From")?.value || ""
      const date = headers.find((h: any) => h.name === "Date")?.value || ""
      
      // Find PDF attachments
      const parts = msgData.payload?.parts || []
      const pdfAttachment = parts.find((p: any) => 
        p.mimeType === "application/pdf" || 
        p.filename?.toLowerCase().endsWith(".pdf")
      )
      
      return {
        id: msg.id,
        subject,
        from,
        date,
        snippet: msgData.snippet || "",
        attachment_filename: pdfAttachment?.filename || "",
        has_pdf: !!pdfAttachment,
      }
    })
  )
  
  return messages.filter((m: any) => m.has_pdf || m.subject)
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const accessToken = (session as any).accessToken
    const messages = body.messages || []

    // If this is a Gmail search request, handle it directly
    const lastMessage = messages[messages.length - 1]?.content || ""
    const isGmailSearch = lastMessage.includes("bills@vega.io") || 
                          lastMessage.includes("Gmail") || 
                          lastMessage.includes("invoice") ||
                          lastMessage.includes("חשבונית")

    if (isGmailSearch && accessToken) {
      // Fetch emails directly from Gmail API
      const emails = await fetchGmailInvoices(accessToken)
      
      if (emails.length === 0) {
        // Ask Claude to return empty array
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": process.env.ANTHROPIC_API_KEY!,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-opus-4-5",
            max_tokens: 100,
            messages: [{ role: "user", content: "Return exactly: []" }],
          }),
        })
        const data = await response.json()
        return NextResponse.json(data)
      }
      
      // Send emails to Claude for extraction
      const emailSummary = emails.map((e: any, i: number) => 
        `Email ${i+1}:
Subject: ${e.subject}
From: ${e.from}
Date: ${e.date}
Snippet: ${e.snippet}
Attachment: ${e.attachment_filename || "none"}
Gmail ID: ${e.id}`
      ).join("\n\n")

      const extractPrompt = `Here are ${emails.length} emails found in Gmail sent to bills@vega.io with attachments.
Extract invoice data from each email. For each email, return a JSON object.

${emailSummary}

Return ONLY a JSON array with one object per email:
[{
  "id": "gmail_message_id",
  "supplier": "supplier name from subject or sender",
  "company_number": "",
  "inv_no": "invoice number if visible in subject or snippet",
  "invoice_date": "DD/MM/YYYY or empty",
  "date": "received date DD/MM/YYYY",
  "currency": "NIS or USD or EUR or GBP",
  "amount": 0,
  "description": "brief description",
  "notes": "",
  "gmail_message_id": "gmail id",
  "attachment_filename": "filename",
  "status": "pending"
}]
If you cannot determine amount or currency, use 0 and "NIS". Always return all ${emails.length} emails.`

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY!,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-opus-4-5",
          max_tokens: 4000,
          messages: [{ role: "user", content: extractPrompt }],
        }),
      })

      const data = await response.json()
      return NextResponse.json(data)
    }

    // Default: pass through to Claude without MCP
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-5",
        max_tokens: body.max_tokens || 6000,
        messages: body.messages,
      }),
    })

    const data = await response.json()
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
