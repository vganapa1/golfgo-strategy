export async function POST(request) {
  const body = await request.json()

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  )

  const data = await response.json()
  return Response.json(data, { status: response.status })
}
