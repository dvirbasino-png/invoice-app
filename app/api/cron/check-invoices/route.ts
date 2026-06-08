import { NextRequest, NextResponse } from "next/server"

const SHEETS_ID = "1qnPwqq9DLOehT_j6ZpbI45VM54s4W3fBJDtQzH_GVdE"

export const maxDuration = 30

export async function GET(req: NextRequest) {
  // Verify this is called by Vercel Cron
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    // Ask Claude to check Gmail for new invoices
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-5",
        max_tokens: 1000,
        mcp_servers: [
          { type: "url", url: "https://gmailmcp.googleapis.com/mcp/v1", name: "gmail-mcp" },
        ],
        messages: [{
          role: "user",
          content: `Check Gmail for unread emails sent to bills@vega.io with PDF attachments in the last 10 minutes.
For each new invoice found, return its subject and sender.
Return ONLY JSON: { "new_invoices": [ { "subject": "...", "from": "..." } ] }
If none found return { "new_invoices": [] }`
        }]
      })
    })

    const data = await response.json()
    const text = data?.content?.find((b: any) => b.type === "text")?.text || ""
    const clean = text.replace(/```json|```/g, "").trim()
    const result = JSON.parse(clean)

    if (result.new_invoices?.length > 0) {
      // Send push notification via Web Push
      // Subscriptions stored in env as JSON array
      const subs = JSON.parse(process.env.PUSH_SUBSCRIPTIONS || "[]")
      const count = result.new_invoices.length
      const first = result.new_invoices[0]

      for (const sub of subs) {
        await sendPushNotification(sub, {
          title: `${count} new invoice${count > 1 ? "s" : ""} arrived`,
          body: first.from + (count > 1 ? ` +${count - 1} more` : ""),
          url: "/",
        })
      }

      return NextResponse.json({ sent: count })
    }

    return NextResponse.json({ sent: 0 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

async function sendPushNotification(subscription: any, payload: any) {
  // Using web-push library pattern via fetch to a push service
  // In production, use the 'web-push' npm package
  // For now we log — wire up web-push in install step
  console.log("Push notification:", payload, "to:", subscription.endpoint?.slice(0, 50))
}
