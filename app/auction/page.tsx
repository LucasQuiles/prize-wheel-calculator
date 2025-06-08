'use client'

import { useEffect, useState } from 'react'

export default function AuctionPage() {
  const [data, setData] = useState<any>(null)

  useEffect(() => {
    fetch('/api/auction')
      .then((res) => res.json())
      .then(setData)
      .catch(() => {})
  }, [])

  return (
    <div className="p-4">
      <h1 className="mb-4 text-xl font-bold">Live Auction Data</h1>
      <pre className="whitespace-pre-wrap rounded bg-muted p-2 text-sm">
        {data ? JSON.stringify(data, null, 2) : 'Loading...'}
      </pre>
    </div>
  )
}
