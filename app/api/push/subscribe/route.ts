import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"

export async function POST(req: NextRequest) {
  const session = await getServerSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const subscription = await req.json()
  // In production: save to a DB (Vercel KV, Supabase, etc.)
  // For simplicity, log it so you can add to PUSH_SUBSCRIPTIONS env var
  console.log("New push subscription:", JSON.stringify(subscription))

  return NextResponse.json({ ok: true })
}
