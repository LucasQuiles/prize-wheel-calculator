import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

export async function GET() {
  try {
    const dataPath = path.join(process.cwd(), 'auction_log.json')
    const text = await fs.readFile(dataPath, 'utf8')
    const lines = text.trim().split('\n').map((l) => JSON.parse(l))
    return NextResponse.json({ items: lines })
  } catch (e) {
    return NextResponse.json({ items: [], error: 'No data available' })
  }
}
