import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]/route"

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json()
  const accessToken = session.accessToken

  // Pass the user's Google access token to MCP servers
  const mcpServers = [
    {
      type: "url",
      url: "https://gmailmcp.googleapis.com/mcp/v1",
      name: "gmail-mcp",
      authorization_token: accessToken,
    },
    {
      type: "url",
      url: "https://drivemcp.googleapis.com/mcp/v1",
      name: "drive-mcp",
      authorization_token: accessToken,
    },
  ]

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
      mcp_servers: mcpServers,
    }),
  })

  const data = await response.json()
  return NextResponse.json(data)
}
