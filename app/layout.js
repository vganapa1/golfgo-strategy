import './globals.css'

export const metadata = {
  title: 'GolfGo Strategy Generator',
  description: 'AI-powered golf hole strategy using Gemini Vision + Claude',
}
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  )
}
