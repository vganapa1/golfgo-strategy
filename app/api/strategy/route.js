export async function POST(request) {
  const body = await request.json()

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  })

  const data = await response.json()
  return Response.json(data, { status: response.status })
}
