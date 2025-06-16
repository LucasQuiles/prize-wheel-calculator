"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  Trash2,
  Undo2,
  Plus,
  Search,
  Edit2,
  Download,
  ListPlus,
  RefreshCw,
  AlertTriangle,
  DollarSign,
  TrendingUp,
  TrendingDown,
} from "lucide-react"
import {
  calculateProbability,
  calculateProbabilityChange,
  streakPValue,
  calculateSurpriseFactor,
  isSignificantStreak,
  updateEWMA,
  calculateExpectedDraws,
  calculateOverdueScore,
  calculateOverduePValue,
  calculateMomentumScore,
  calculatePredictionScore,
} from "./utils/statistics"
import type { ItemStats, SessionStats, PNLBreakdown } from "./types/statistics"

interface WheelItem {
  id: string
  name: string
  initialCount: number
  remaining: number
  msrp: number
  streakLength?: number
  ewma?: number
}

interface SpinEntry {
  id: string
  timestamp: Date
  itemId: string
  itemName: string
  cost: number
  probabilityAtSpin: number
  itemMSRP: number
}

export default function PrizeWheelCalculator() {
  const [wheelItems, setWheelItems] = useState<WheelItem[]>([])
  const [spinHistory, setSpinHistory] = useState<SpinEntry[]>([])
  const [selectedItemId, setSelectedItemId] = useState("")
  const [spinCost, setSpinCost] = useState("")
  const [sessionStartTime, setSessionStartTime] = useState<Date>(new Date())
  const [sessionDuration, setSessionDuration] = useState("00:00:00")
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false)
  const [newItemName, setNewItemName] = useState("")
  const [newItemCount, setNewItemCount] = useState("")
  const [newItemMSRP, setNewItemMSRP] = useState("")
  const [historyFilter, setHistoryFilter] = useState("")
  const [bulkImportText, setBulkImportText] = useState("")
  const [bulkImportPreview, setBulkImportPreview] = useState<Array<{ name: string; count: number; msrp: number }>>([])
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false)
  const [isPNLModalOpen, setIsPNLModalOpen] = useState(false)
  const [ewmaAlpha] = useState(0.1) // Smoothing factor for EWMA

  const itemInputRef = useRef<HTMLInputElement>(null)
  const costInputRef = useRef<HTMLInputElement>(null)
  const recordButtonRef = useRef<HTMLButtonElement>(null)

  // Auto-focus on item input when component loads
  useEffect(() => {
    if (wheelItems.length > 0) {
      itemInputRef.current?.focus()
    }
  }, [wheelItems.length])

  // Session timer
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date()
      const diff = now.getTime() - sessionStartTime.getTime()
      const hours = Math.floor(diff / 3600000)
      const minutes = Math.floor((diff % 3600000) / 60000)
      const seconds = Math.floor((diff % 60000) / 1000)
      setSessionDuration(
        `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`,
      )
    }, 1000)

    return () => clearInterval(timer)
  }, [sessionStartTime])

  // Initialize with sample data if empty
  useEffect(() => {
    if (wheelItems.length === 0) {
      setIsConfigModalOpen(true)
    }
  }, [wheelItems.length])

  // Average spin cost for current session
  const avgSpinCost = useMemo(() => {
    if (spinHistory.length === 0) return 0
    const total = spinHistory.reduce((sum, spin) => sum + spin.cost, 0)
    return total / spinHistory.length
  }, [spinHistory])

  // Calculate item statistics with advanced metrics
  const itemStats = useMemo<ItemStats[]>(() => {
    const totalInitialItems = wheelItems.reduce((sum, item) => sum + item.initialCount, 0)
    const totalRemaining = wheelItems.reduce((sum, item) => sum + item.remaining, 0)
    const totalSpins = spinHistory.length

    return wheelItems.map((item) => {
      const currentProbability = calculateProbability(item.remaining, totalRemaining)
      const initialProbability = calculateProbability(item.initialCount, totalInitialItems)
      const probabilityChange = calculateProbabilityChange(currentProbability, initialProbability)

      // Calculate actual draws and expected draws
      const actualDraws = item.initialCount - item.remaining
      const expectedDraws = calculateExpectedDraws(item.initialCount, totalInitialItems, totalSpins)
      const overdueScore = calculateOverdueScore(actualDraws, expectedDraws)
      const overduePValue = calculateOverduePValue(actualDraws, totalSpins, initialProbability / 100)
      const isOverdue = overdueScore < -1 && overduePValue < 0.1 // Significantly underdrawn

      // Calculate recent draws (last 10 spins)
      const recentSpins = Math.min(10, totalSpins)
      const recentHistory = spinHistory.slice(0, recentSpins)
      const recentDraws = recentHistory.filter((spin) => spin.itemId === item.id).length
      const momentumScore = calculateMomentumScore(recentDraws, actualDraws, recentSpins, totalSpins)

      // Calculate streak length
      const streakLength = item.streakLength || 0

      // Calculate streak p-value
      const pValue =
        streakLength > 0 ? streakPValue(streakLength, totalSpins, item.initialCount, totalInitialItems) : 1.0

      // Calculate surprise factor (0-10 scale)
      const surpriseFactor = calculateSurpriseFactor(pValue)

      // Determine if streak is statistically significant
      const isSignificant = isSignificantStreak(pValue)

      // EWMA and deviation
      const ewma = item.ewma || initialProbability / 100
      const expectedHitRate = initialProbability / 100
      const ewmaDeviation =
        Math.abs(ewma - expectedHitRate) /
        Math.sqrt((expectedHitRate * (1 - expectedHitRate)) / Math.max(1, totalSpins))

      // Calculate prediction score
      const predictionScore = calculatePredictionScore(
        {
          remaining: item.remaining,
          initialCount: item.initialCount,
          currentProbability,
          overdueScore,
          momentumScore,
          streakLength,
        },
        totalSpins,
      )

      // Calculate COGS for this item
      const totalCOGS = actualDraws * item.msrp

      // Expected value for next spin based on average cost
      const expectedValue = (currentProbability / 100) * item.msrp - avgSpinCost

      return {
        id: item.id,
        name: item.name,
        initialCount: item.initialCount,
        remaining: item.remaining,
        currentProbability,
        initialProbability,
        probabilityChange,
        streakLength,
        streakPValue: pValue,
        surpriseFactor,
        isSignificant,
        ewma: ewma * 100,
        ewmaDeviation,
        actualDraws,
        expectedDraws,
        overdueScore,
        overduePValue,
        isOverdue,
        momentumScore,
        predictionScore,
        recentDraws,
        msrp: item.msrp,
        totalCOGS,
        expectedValue,
      }
    })
  }, [wheelItems, spinHistory, avgSpinCost])

  // Calculate PNL breakdown
  const pnlBreakdown = useMemo<PNLBreakdown[]>(() => {
    return itemStats
      .filter((item) => item.actualDraws > 0)
      .map((item) => {
        // Calculate revenue generated from spins that resulted in this item
        const itemSpins = spinHistory.filter((spin) => spin.itemId === item.id)
        const revenueFromItem = itemSpins.reduce((sum, spin) => sum + spin.cost, 0)
        const profitFromItem = revenueFromItem - item.totalCOGS
        const profitMargin = revenueFromItem > 0 ? (profitFromItem / revenueFromItem) * 100 : 0

        return {
          itemName: item.name,
          quantityDrawn: item.actualDraws,
          msrp: item.msrp,
          totalCOGS: item.totalCOGS,
          revenueFromItem,
          profitFromItem,
          profitMargin,
        }
      })
      .sort((a, b) => b.profitFromItem - a.profitFromItem) // Sort by profit descending
  }, [itemStats, spinHistory])

  // Calculate session statistics
  const sessionStats = useMemo<SessionStats>(() => {
    const totalSpins = spinHistory.length
    const totalRevenue = spinHistory.reduce((sum, spin) => sum + spin.cost, 0)
    const totalCOGS = spinHistory.reduce((sum, spin) => sum + spin.itemMSRP, 0)
    const grossProfit = totalRevenue - totalCOGS
    const profitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0
    const avgCostPerSpin = totalSpins > 0 ? totalRevenue / totalSpins : 0

    const totalInitialItems = wheelItems.reduce((sum, item) => sum + item.initialCount, 0)
    const totalRemaining = wheelItems.reduce((sum, item) => sum + item.remaining, 0)
    const itemsDrawn = totalInitialItems - totalRemaining

    const avgRevenuePerItem = itemsDrawn > 0 ? totalRevenue / itemsDrawn : 0
    const avgCOGSPerItem = itemsDrawn > 0 ? totalCOGS / itemsDrawn : 0

    // Expected value of next spin using current probabilities
    const expectedReturn =
      itemStats.reduce((sum, item) => sum + (item.currentProbability / 100) * item.msrp, 0) -
      avgCostPerSpin

    const bestEVItem =
      itemStats.length > 0
        ? itemStats.reduce((max, item) =>
            item.expectedValue > max.expectedValue ? item : max,
            itemStats[0],
          )
        : null

    const availableItems = itemStats.filter((item) => item.remaining > 0)
    const mostLikely =
      availableItems.length > 0
        ? availableItems.reduce(
            (max, item) => (item.currentProbability > max.currentProbability ? item : max),
            availableItems[0],
          )
        : null

    const leastLikely =
      availableItems.length > 1
        ? availableItems.reduce(
            (min, item) => (item.currentProbability < min.currentProbability ? item : min),
            availableItems[0],
          )
        : null

    const significantStreaks = itemStats.filter((item) => item.isSignificant)
    const mostSignificantStreak =
      significantStreaks.length > 0
        ? significantStreaks.reduce(
            (max, item) => (item.surpriseFactor > max.surpriseFactor ? item : max),
            significantStreaks[0],
          )
        : null

    // Find most overdue item (most negative overdue score with statistical significance)
    const overdueItems = itemStats.filter((item) => item.isOverdue && item.remaining > 0)
    const mostOverdueItem =
      overdueItems.length > 0
        ? overdueItems.reduce(
            (max, item) => (Math.abs(item.overdueScore) > Math.abs(max.overdueScore) ? item : max),
            overdueItems[0],
          )
        : null

    // Find best prediction for next item
    const bestPrediction =
      availableItems.length > 0
        ? availableItems.reduce(
            (max, item) => (item.predictionScore > max.predictionScore ? item : max),
            availableItems[0],
          )
        : null

    // Find most and least profitable items
    const drawnItems = itemStats.filter((item) => item.actualDraws > 0)
    const mostProfitableItem =
      pnlBreakdown.length > 0 ? itemStats.find((item) => item.name === pnlBreakdown[0].itemName) || null : null

    const leastProfitableItem =
      pnlBreakdown.length > 0
        ? itemStats.find((item) => item.name === pnlBreakdown[pnlBreakdown.length - 1].itemName) || null
        : null

    const neverDrawnItems = itemStats.filter((item) => item.remaining === item.initialCount && item.remaining > 0)

    const recentSpins = spinHistory.slice(0, 3)
    const recentItems = [...new Set(recentSpins.map((spin) => spin.itemName))]

    const progressPercent = totalInitialItems > 0 ? ((totalInitialItems - totalRemaining) / totalInitialItems) * 100 : 0

    return {
      totalSpins,
      totalCost: totalRevenue, // Renamed for consistency
      avgCostPerSpin,
      totalItems: totalRemaining,
      itemsDrawn,
      mostLikelyItem: mostLikely,
      leastLikelyItem: leastLikely,
      mostSignificantStreak,
      mostOverdueItem,
      neverDrawnItems,
      recentItems,
      progressPercent,
      bestPrediction,
      expectedValuePerSpin: expectedReturn,
      bestEVItem,
      // PNL Stats
      totalRevenue,
      totalCOGS,
      grossProfit,
      profitMargin,
      avgRevenuePerItem,
      avgCOGSPerItem,
      mostProfitableItem,
      leastProfitableItem,
    }
  }, [itemStats, spinHistory, wheelItems, pnlBreakdown])

  const recordSpin = useCallback(() => {
    if (!selectedItemId || !spinCost) return

    const selectedItem = wheelItems.find((item) => item.id === selectedItemId)
    if (!selectedItem || selectedItem.remaining <= 0) return

    const totalRemaining = wheelItems.reduce((sum, item) => sum + item.remaining, 0)
    const probability = calculateProbability(selectedItem.remaining, totalRemaining)

    const newSpin: SpinEntry = {
      id: Date.now().toString(),
      timestamp: new Date(),
      itemId: selectedItemId,
      itemName: selectedItem.name,
      cost: Number.parseFloat(spinCost),
      probabilityAtSpin: probability,
      itemMSRP: selectedItem.msrp,
    }

    setSpinHistory((prev) => [newSpin, ...prev])

    // Update remaining count and streak information
    setWheelItems((prev) =>
      prev.map((item) => {
        if (item.id === selectedItemId) {
          // Update streak length and EWMA for the selected item
          const newStreakLength = (item.streakLength || 0) + 1
          const newEWMA = updateEWMA(item.ewma || probability / 100, 1, ewmaAlpha)

          return {
            ...item,
            remaining: item.remaining - 1,
            streakLength: newStreakLength,
            ewma: newEWMA,
          }
        } else {
          // Reset streak for other items and update their EWMA
          const newEWMA = updateEWMA(item.ewma || 0, 0, ewmaAlpha)
          return {
            ...item,
            streakLength: 0,
            ewma: newEWMA,
          }
        }
      }),
    )

    // Reset form - ready for next spin
    setSelectedItemId("")
    setSpinCost("")

    // Brief success feedback
    setTimeout(() => {
      // Could add a toast notification here
    }, 100)
  }, [selectedItemId, spinCost, wheelItems, ewmaAlpha])

  const undoLastSpin = () => {
    if (spinHistory.length === 0) return

    const lastSpin = spinHistory[0]
    setSpinHistory((prev) => prev.slice(1))

    // Restore item count and update streaks
    setWheelItems((prev) => {
      // First, find the previous spin for the same item (if any)
      const prevSpinOfSameItem = spinHistory.slice(1).find((spin) => spin.itemId === lastSpin.itemId)
      const wasPartOfStreak = prevSpinOfSameItem && spinHistory.indexOf(prevSpinOfSameItem) === 1 // Check if it was the immediately previous spin

      return prev.map((item) => {
        if (item.id === lastSpin.itemId) {
          // If this was part of a streak, reduce streak length by 1, otherwise reset to 0
          const newStreakLength = wasPartOfStreak ? Math.max(0, (item.streakLength || 0) - 1) : 0

          // Adjust EWMA - this is an approximation since we can't perfectly undo EWMA
          const newEWMA = item.ewma ? (item.ewma - ewmaAlpha) / (1 - ewmaAlpha) : 0

          return {
            ...item,
            remaining: item.remaining + 1,
            streakLength: newStreakLength,
            ewma: Math.max(0, newEWMA),
          }
        }
        return item
      })
    })
  }

  const resetSession = () => {
    // Reset all session data
    setSpinHistory([])
    setWheelItems((prev) =>
      prev.map((item) => ({
        ...item,
        remaining: item.initialCount,
        streakLength: 0,
        ewma: undefined,
      })),
    )
    setSessionStartTime(new Date())
    setSelectedItemId("")
    setSpinCost("")
    setHistoryFilter("")
    setIsResetConfirmOpen(false)
  }

  const addWheelItem = () => {
    if (!newItemName || !newItemCount) return

    const newItem: WheelItem = {
      id: Date.now().toString(),
      name: newItemName,
      initialCount: Number.parseInt(newItemCount),
      remaining: Number.parseInt(newItemCount),
      msrp: Number.parseFloat(newItemMSRP) || 0,
      streakLength: 0,
      ewma: 0,
    }

    setWheelItems((prev) => [...prev, newItem])
    setNewItemName("")
    setNewItemCount("")
    setNewItemMSRP("")
  }

  const processBulkImport = () => {
    const lines = bulkImportText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
    const items: Array<{ name: string; count: number; msrp: number }> = []

    let currentItem = ""
    let currentQty = 0
    let currentMSRP = 0

    for (const line of lines) {
      // Match item lines like "1x TWO PACKER - CHINESE GEM VOL 1"
      const itemMatch = line.match(/^\d+x\s+(.+)$/)
      if (itemMatch) {
        currentItem = itemMatch[1].trim()
        continue
      }

      // Match quantity lines like "Qty: 192"
      const qtyMatch = line.match(/^Qty:\s*(\d+)$/)
      if (qtyMatch) {
        currentQty = Number.parseInt(qtyMatch[1])
        continue
      }

      // Match MSRP lines like "MSRP: $15.99" or "MSRP: 15.99"
      const msrpMatch = line.match(/^MSRP:\s*\$?(\d+\.?\d*)$/)
      if (msrpMatch && currentItem && currentQty > 0) {
        currentMSRP = Number.parseFloat(msrpMatch[1])
        items.push({
          name: currentItem,
          count: currentQty,
          msrp: currentMSRP,
        })
        currentItem = ""
        currentQty = 0
        currentMSRP = 0
        continue
      }

      // Handle items without MSRP (set to 0)
      if (line.toLowerCase().includes("coming up") && currentItem && currentQty > 0) {
        items.push({
          name: currentItem,
          count: currentQty,
          msrp: 0,
        })
        currentItem = ""
        currentQty = 0
        currentMSRP = 0
      }
    }

    setBulkImportPreview(items)

    // Auto-import if items were found
    if (items.length > 0) {
      const newItems: WheelItem[] = items.map((item) => ({
        id: Date.now().toString() + Math.random().toString(),
        name: item.name,
        initialCount: item.count,
        remaining: item.count,
        msrp: item.msrp,
        streakLength: 0,
        ewma: 0,
      }))

      setWheelItems((prev) => [...prev, ...newItems])
      setBulkImportText("")
      setBulkImportPreview([])
    }
  }

  // Update the bulkImportPreview when text changes
  useEffect(() => {
    if (!bulkImportText.trim()) {
      setBulkImportPreview([])
      return
    }

    const lines = bulkImportText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
    const items: Array<{ name: string; count: number; msrp: number }> = []

    let currentItem = ""
    let currentQty = 0
    let currentMSRP = 0

    for (const line of lines) {
      const itemMatch = line.match(/^\d+x\s+(.+)$/)
      if (itemMatch) {
        currentItem = itemMatch[1].trim()
        continue
      }

      const qtyMatch = line.match(/^Qty:\s*(\d+)$/)
      if (qtyMatch) {
        currentQty = Number.parseInt(qtyMatch[1])
        continue
      }

      const msrpMatch = line.match(/^MSRP:\s*\$?(\d+\.?\d*)$/)
      if (msrpMatch && currentItem && currentQty > 0) {
        currentMSRP = Number.parseFloat(msrpMatch[1])
        items.push({
          name: currentItem,
          count: currentQty,
          msrp: currentMSRP,
        })
        currentItem = ""
        currentQty = 0
        currentMSRP = 0
        continue
      }

      if (line.toLowerCase().includes("coming up") && currentItem && currentQty > 0) {
        items.push({
          name: currentItem,
          count: currentQty,
          msrp: 0,
        })
        currentItem = ""
        currentQty = 0
        currentMSRP = 0
      }
    }

    setBulkImportPreview(items)
  }, [bulkImportText])

  const exportCSV = () => {
    const headers = ["Timestamp", "Item", "Spin Cost", "Item MSRP", "Probability at Spin", "Profit/Loss"]
    const csvContent = [
      headers.join(","),
      ...spinHistory.map((spin) =>
        [
          spin.timestamp.toISOString(),
          spin.itemName,
          spin.cost.toString(),
          spin.itemMSRP.toString(),
          spin.probabilityAtSpin.toFixed(2),
          (spin.cost - spin.itemMSRP).toFixed(2),
        ].join(","),
      ),
    ].join("\n")

    const blob = new Blob([csvContent], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `prize-wheel-session-${new Date().toISOString().split("T")[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Handle Enter key
      if (e.key === "Enter" && !isConfigModalOpen && !isResetConfirmOpen && !isPNLModalOpen) {
        if (selectedItemId && spinCost && document.activeElement === costInputRef.current) {
          recordSpin()
        }
      }

      // Handle Escape key
      if (e.key === "Escape" && !isConfigModalOpen && !isResetConfirmOpen && !isPNLModalOpen) {
        setSelectedItemId("")
        setSpinCost("")
      }

      // Handle Ctrl + number shortcuts
      if (e.ctrlKey && e.key >= "1" && e.key <= "9") {
        e.preventDefault()
        const index = Number.parseInt(e.key) - 1
        const availableItems = wheelItems.filter((item) => item.remaining > 0)
        if (availableItems[index]) {
          setSelectedItemId(availableItems[index].id)
          setTimeout(() => costInputRef.current?.focus(), 100)
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [wheelItems, recordSpin, isConfigModalOpen, isResetConfirmOpen, isPNLModalOpen, selectedItemId, spinCost])

  const filteredHistory = spinHistory.filter(
    (spin) =>
      spin.itemName.toLowerCase().includes(historyFilter.toLowerCase()) || spin.cost.toString().includes(historyFilter),
  )

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Bar */}
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Prize Wheel Odds Calculator</h1>
        <div className="flex items-center gap-3">
          {/* PNL Button */}
          <Dialog open={isPNLModalOpen} onOpenChange={setIsPNLModalOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="border-green-200 text-green-600 hover:bg-green-50">
                <DollarSign className="w-4 h-4 mr-2" />
                P&L Analysis
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl">
              <DialogHeader>
                <DialogTitle>Profit & Loss Analysis</DialogTitle>
              </DialogHeader>
              <div className="space-y-6">
                {/* Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-sm text-gray-600">Total Revenue</div>
                      <div className="text-2xl font-bold text-green-600">${sessionStats.totalRevenue.toFixed(2)}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-sm text-gray-600">Total COGS</div>
                      <div className="text-2xl font-bold text-red-600">${sessionStats.totalCOGS.toFixed(2)}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-sm text-gray-600">Gross Profit</div>
                      <div
                        className={`text-2xl font-bold ${sessionStats.grossProfit >= 0 ? "text-green-600" : "text-red-600"}`}
                      >
                        ${sessionStats.grossProfit.toFixed(2)}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-sm text-gray-600">Profit Margin</div>
                      <div
                        className={`text-2xl font-bold ${sessionStats.profitMargin >= 0 ? "text-green-600" : "text-red-600"}`}
                      >
                        {sessionStats.profitMargin.toFixed(1)}%
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Item Breakdown */}
                <div>
                  <h3 className="text-lg font-semibold mb-4">Item Profitability Breakdown</h3>
                  <div className="max-h-96 overflow-y-auto border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item</TableHead>
                          <TableHead>Qty Drawn</TableHead>
                          <TableHead>MSRP</TableHead>
                          <TableHead>Total COGS</TableHead>
                          <TableHead>Revenue</TableHead>
                          <TableHead>Profit</TableHead>
                          <TableHead>Margin</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pnlBreakdown.map((item, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium">{item.itemName}</TableCell>
                            <TableCell>{item.quantityDrawn}</TableCell>
                            <TableCell>${item.msrp.toFixed(2)}</TableCell>
                            <TableCell className="text-red-600">${item.totalCOGS.toFixed(2)}</TableCell>
                            <TableCell className="text-green-600">${item.revenueFromItem.toFixed(2)}</TableCell>
                            <TableCell className={item.profitFromItem >= 0 ? "text-green-600" : "text-red-600"}>
                              ${item.profitFromItem.toFixed(2)}
                            </TableCell>
                            <TableCell className={item.profitMargin >= 0 ? "text-green-600" : "text-red-600"}>
                              {item.profitMargin.toFixed(1)}%
                            </TableCell>
                          </TableRow>
                        ))}
                        {pnlBreakdown.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center text-gray-500 py-8">
                              No items drawn yet
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Edit Items Button - Always visible */}
          <Dialog open={isConfigModalOpen} onOpenChange={setIsConfigModalOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="border-blue-200 text-blue-600 hover:bg-blue-50">
                <ListPlus className="w-4 h-4 mr-2" />
                Edit Items
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
              <DialogHeader>
                <DialogTitle>Item List Configuration</DialogTitle>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                {/* Bulk Import Section */}
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium text-blue-900">Bulk Import</h3>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const sampleText = `1x TWO PACKER - CHINESE GEM VOL 1
Qty: 192
MSRP: $15.99
Coming Up
1x THREE PACKER - JOURNEY TOGETHER (RANDOM ART/PROMO)
Qty: 20
MSRP: $25.99
Coming Up
1x BOOSTER BUNDLE - SURGING SPARKS
Qty: 15
MSRP: $12.99`
                        setBulkImportText(sampleText)
                      }}
                    >
                      Load Sample
                    </Button>
                  </div>
                  <textarea
                    placeholder="Paste your list here... Format: 1x ITEM NAME, Qty: NUMBER, MSRP: $XX.XX"
                    value={bulkImportText}
                    onChange={(e) => setBulkImportText(e.target.value)}
                    className="w-full h-32 p-3 border rounded-md text-sm font-mono"
                  />
                  <div className="flex gap-2 mt-3">
                    <Button onClick={processBulkImport} disabled={!bulkImportText.trim()}>
                      Import Items
                    </Button>
                    <Button variant="outline" onClick={() => setBulkImportText("")}>
                      Clear
                    </Button>
                  </div>
                  {bulkImportPreview.length > 0 && (
                    <div className="mt-3 p-3 bg-white rounded border">
                      <div className="text-sm font-medium mb-2">Preview ({bulkImportPreview.length} items):</div>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {bulkImportPreview.map((item, index) => (
                          <div key={index} className="text-xs text-gray-600">
                            {item.name} - Qty: {item.count} - MSRP: ${item.msrp.toFixed(2)}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Manual Add Section */}
                <div className="grid grid-cols-4 gap-4">
                  <Input placeholder="Item name" value={newItemName} onChange={(e) => setNewItemName(e.target.value)} />
                  <Input
                    type="number"
                    placeholder="Initial count"
                    value={newItemCount}
                    onChange={(e) => setNewItemCount(e.target.value)}
                  />
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="MSRP ($)"
                    value={newItemMSRP}
                    onChange={(e) => setNewItemMSRP(e.target.value)}
                  />
                  <Button onClick={addWheelItem} disabled={!newItemName || !newItemCount}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Item
                  </Button>
                </div>

                <div className="max-h-64 overflow-y-auto border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item Name</TableHead>
                        <TableHead>Initial Count</TableHead>
                        <TableHead>MSRP</TableHead>
                        <TableHead>Remaining</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {wheelItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <Input
                              value={item.name}
                              onChange={(e) => {
                                setWheelItems((prev) =>
                                  prev.map((i) => (i.id === item.id ? { ...i, name: e.target.value } : i)),
                                )
                              }}
                              className="border-0 p-1 h-8"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={item.initialCount}
                              onChange={(e) => {
                                const newCount = Number.parseInt(e.target.value) || 0
                                setWheelItems((prev) =>
                                  prev.map((i) =>
                                    i.id === item.id
                                      ? {
                                          ...i,
                                          initialCount: newCount,
                                          remaining: newCount, // Reset remaining when initial changes
                                          streakLength: 0,
                                          ewma: 0,
                                        }
                                      : i,
                                  ),
                                )
                              }}
                              className="border-0 p-1 h-8 w-20"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              step="0.01"
                              value={item.msrp}
                              onChange={(e) => {
                                const newMSRP = Number.parseFloat(e.target.value) || 0
                                setWheelItems((prev) =>
                                  prev.map((i) => (i.id === item.id ? { ...i, msrp: newMSRP } : i)),
                                )
                              }}
                              className="border-0 p-1 h-8 w-20"
                            />
                          </TableCell>
                          <TableCell>{item.remaining}</TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setWheelItems((prev) => prev.filter((i) => i.id !== item.id))
                              }}
                              className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex justify-end pt-4 border-t bg-white sticky bottom-0">
                  <Button onClick={() => setIsConfigModalOpen(false)}>Save & Close</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Reset Session Button */}
          <Dialog open={isResetConfirmOpen} onOpenChange={setIsResetConfirmOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="border-red-200 text-red-600 hover:bg-red-50">
                <RefreshCw className="w-4 h-4 mr-2" />
                Reset Session
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Reset Session</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <p className="text-gray-700">Are you sure you want to reset the session? This will:</p>
                <ul className="list-disc pl-5 space-y-1 text-gray-600">
                  <li>Clear all spin history</li>
                  <li>Reset all item counts to their initial values</li>
                  <li>Reset the session timer</li>
                  <li>Clear all P&L data</li>
                </ul>
                <p className="text-gray-700">This action cannot be undone.</p>
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setIsResetConfirmOpen(false)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={resetSession}>
                  Reset Session
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Button variant="outline" size="sm" onClick={undoLastSpin} disabled={spinHistory.length === 0}>
            <Undo2 className="w-4 h-4 mr-2" />
            Undo Last Spin
          </Button>
        </div>
      </div>

      {/* Key Indicators Bar */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b px-6 py-4">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-9 gap-4">
          {/* Most Likely Next */}
          {sessionStats.mostLikelyItem && (
            <div className="bg-white rounded-lg p-3 border-2 border-green-200">
              <div className="text-xs font-medium text-green-700 uppercase tracking-wide">Most Likely Next</div>
              <div className="font-bold text-lg text-green-900">{sessionStats.mostLikelyItem.name}</div>
              <div className="text-sm text-green-600">
                {sessionStats.mostLikelyItem.currentProbability.toFixed(1)}% chance
              </div>
              {sessionStats.mostLikelyItem.probabilityChange !== 0 && (
                <div
                  className={`text-xs ${sessionStats.mostLikelyItem.probabilityChange > 0 ? "text-green-500" : "text-red-500"}`}
                >
                  {sessionStats.mostLikelyItem.probabilityChange > 0 ? "↑" : "↓"}
                  {Math.abs(sessionStats.mostLikelyItem.probabilityChange).toFixed(1)}% vs initial
                </div>
              )}
            </div>
          )}

          {/* Least Likely */}
          {sessionStats.leastLikelyItem && (
            <div className="bg-white rounded-lg p-3 border-2 border-orange-200">
              <div className="text-xs font-medium text-orange-700 uppercase tracking-wide">Least Likely</div>
              <div className="font-bold text-lg text-orange-900">{sessionStats.leastLikelyItem.name}</div>
              <div className="text-sm text-orange-600">
                {sessionStats.leastLikelyItem.currentProbability.toFixed(1)}% chance
              </div>
              {sessionStats.leastLikelyItem.probabilityChange !== 0 && (
                <div
                  className={`text-xs ${sessionStats.leastLikelyItem.probabilityChange > 0 ? "text-green-500" : "text-red-500"}`}
                >
                  {sessionStats.leastLikelyItem.probabilityChange > 0 ? "↑" : "↓"}
                  {Math.abs(sessionStats.leastLikelyItem.probabilityChange).toFixed(1)}% vs initial
                </div>
              )}
            </div>
          )}

          {/* Statistical Anomaly */}
          {sessionStats.mostSignificantStreak ? (
            <div className="bg-white rounded-lg p-3 border-2 border-purple-200">
              <div className="text-xs font-medium text-purple-700 uppercase tracking-wide flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Statistical Anomaly
              </div>
              <div className="font-bold text-lg text-purple-900">{sessionStats.mostSignificantStreak.name}</div>
              <div className="text-sm text-purple-600">{sessionStats.mostSignificantStreak.streakLength}x streak</div>
              <div className="text-xs text-purple-500">
                p-value: {sessionStats.mostSignificantStreak.streakPValue.toFixed(4)}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg p-3 border-2 border-gray-200">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Statistical Anomaly</div>
              <div className="font-bold text-lg text-gray-700">None Detected</div>
              <div className="text-sm text-gray-500">All patterns within normal range</div>
            </div>
          )}

          {/* Overdue Analysis */}
          {sessionStats.mostOverdueItem ? (
            <div className="bg-white rounded-lg p-3 border-2 border-yellow-200">
              <div className="text-xs font-medium text-yellow-700 uppercase tracking-wide flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Overdue Analysis
              </div>
              <div className="font-bold text-lg text-yellow-900">{sessionStats.mostOverdueItem.name}</div>
              <div className="text-sm text-yellow-600">
                {Math.abs(sessionStats.mostOverdueItem.overdueScore).toFixed(1)} draws behind
              </div>
              <div className="text-xs text-yellow-500">
                p-value: {sessionStats.mostOverdueItem.overduePValue.toFixed(3)}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg p-3 border-2 border-gray-200">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Overdue Analysis</div>
              <div className="font-bold text-lg text-gray-700">All Balanced</div>
              <div className="text-sm text-gray-500">No items significantly overdue</div>
            </div>
          )}

          {/* Profit Margin */}
          <div
            className={`bg-white rounded-lg p-3 border-2 ${sessionStats.profitMargin >= 0 ? "border-green-200" : "border-red-200"}`}
          >
            <div
              className={`text-xs font-medium uppercase tracking-wide flex items-center gap-1 ${sessionStats.profitMargin >= 0 ? "text-green-700" : "text-red-700"}`}
            >
              {sessionStats.profitMargin >= 0 ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              Profit Margin
            </div>
            <div className={`font-bold text-lg ${sessionStats.profitMargin >= 0 ? "text-green-900" : "text-red-900"}`}>
              {sessionStats.profitMargin.toFixed(1)}%
            </div>
            <div className={`text-sm ${sessionStats.profitMargin >= 0 ? "text-green-600" : "text-red-600"}`}>
              ${sessionStats.grossProfit.toFixed(2)} profit
            </div>
          </div>

          {/* Never Drawn */}
          <div className="bg-white rounded-lg p-3 border-2 border-purple-200">
            <div className="text-xs font-medium text-purple-700 uppercase tracking-wide">Never Drawn</div>
            <div className="font-bold text-lg text-purple-900">
              {sessionStats.neverDrawnItems.length === 0 ? "None" : sessionStats.neverDrawnItems.length}
            </div>
            <div className="text-sm text-purple-600">
              {sessionStats.neverDrawnItems.length === 0
                ? "All items tried"
                : sessionStats.neverDrawnItems.length === 1
                  ? sessionStats.neverDrawnItems[0].name
                  : "items untouched"}
            </div>
          </div>

          {/* Best Prediction for Next Item */}
          {sessionStats.bestPrediction && (
            <div className="bg-white rounded-lg p-3 border-2 border-emerald-200">
              <div className="text-xs font-medium text-emerald-700 uppercase tracking-wide">Next Item Prediction</div>
              <div className="font-bold text-lg text-emerald-900">{sessionStats.bestPrediction.name}</div>
              <div className="text-sm text-emerald-600">
                Score: {sessionStats.bestPrediction.predictionScore.toFixed(1)}
              </div>
              {sessionStats.bestPrediction.isOverdue && (
                <div className="text-xs text-emerald-500">
                  {Math.abs(sessionStats.bestPrediction.overdueScore).toFixed(1)} draws behind expected
                </div>
              )}
            </div>
          )}

          {/* Average Spin Cost */}
          <div className="bg-white rounded-lg p-3 border-2 border-cyan-200">
            <div className="text-xs font-medium text-cyan-700 uppercase tracking-wide">Avg Spin Cost</div>
            <div className="font-bold text-lg text-cyan-900">${sessionStats.avgCostPerSpin.toFixed(2)}</div>
            <div className="text-sm text-cyan-600">{sessionStats.totalSpins} spins</div>
          </div>

          {/* Expected Value */}
          <div
            className={`bg-white rounded-lg p-3 border-2 ${sessionStats.expectedValuePerSpin >= 0 ? 'border-green-200' : 'border-red-200'}`}
          >
            <div
              className={`text-xs font-medium uppercase tracking-wide ${sessionStats.expectedValuePerSpin >= 0 ? 'text-green-700' : 'text-red-700'}`}
            >
              EV per Spin
            </div>
            <div
              className={`font-bold text-lg ${sessionStats.expectedValuePerSpin >= 0 ? 'text-green-900' : 'text-red-900'}`}
            >
              ${sessionStats.expectedValuePerSpin.toFixed(2)}
            </div>
            {sessionStats.bestEVItem && (
              <div className="text-sm text-gray-600">Best: {sessionStats.bestEVItem.name}</div>
            )}
          </div>
        </div>
      </div>

      {/* Main Workspace */}
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Spin Entry Panel */}
          <Card className="border-2 border-blue-200">
            <CardHeader className="bg-blue-50">
              <CardTitle>Spin Entry</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedItemId ? (
                // Cost input mode
                <div className="space-y-4">
                  <div className="p-4 bg-blue-50 rounded-lg border-2 border-blue-200">
                    <div className="font-medium text-blue-900">
                      {wheelItems.find((item) => item.id === selectedItemId)?.name}
                    </div>
                    <div className="text-sm text-blue-600">
                      {wheelItems.find((item) => item.id === selectedItemId)?.remaining} remaining • MSRP: $
                      {wheelItems.find((item) => item.id === selectedItemId)?.msrp.toFixed(2)}
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">Spin Cost ($)</label>
                    <Input
                      ref={costInputRef}
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={spinCost}
                      onChange={(e) => setSpinCost(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && spinCost) {
                          recordSpin()
                        }
                        if (e.key === "Escape") {
                          setSelectedItemId("")
                          setSpinCost("")
                        }
                      }}
                      autoFocus
                    />
                    {spinCost && (
                      <div className="text-xs text-gray-500 mt-1">
                        Profit/Loss: $
                        {(
                          Number.parseFloat(spinCost) -
                          (wheelItems.find((item) => item.id === selectedItemId)?.msrp || 0)
                        ).toFixed(2)}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={recordSpin}
                      disabled={!spinCost}
                      className="flex-1 bg-green-600 hover:bg-green-700"
                    >
                      Record Spin
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSelectedItemId("")
                        setSpinCost("")
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                // Item selection mode
                <div className="space-y-3">
                  <div className="text-sm font-medium mb-3">Click an item to record spin:</div>
                  <div className="grid grid-cols-1 gap-2">
                    {itemStats
                      .filter((item) => item.remaining > 0)
                      .map((item) => {
                        const stat = itemStats.find((s) => s.id === item.id)
                        const isSignificant = stat?.isSignificant
                        const streakLength = stat?.streakLength || 0

                        return (
                          <Button
                            key={item.id}
                            variant="outline"
                            onClick={() => {
                              setSelectedItemId(item.id)
                              setTimeout(() => costInputRef.current?.focus(), 100)
                            }}
                            className={`h-auto p-4 justify-between hover:bg-blue-50 hover:border-blue-300 ${
                              isSignificant ? "border-purple-300 bg-purple-50" : ""
                            }`}
                          >
                            <div className="text-left">
                              <div className="font-medium flex items-center gap-1">
                                {item.name}
                                {isSignificant && <AlertTriangle className="h-3 w-3 text-purple-500" />}
                              </div>
                              <div className="text-sm text-gray-500">
                                {item.remaining} left • {item.currentProbability.toFixed(1)}% chance • MSRP: $
                                {item.msrp.toFixed(2)}
                              </div>
                              {streakLength > 0 && (
                                <div className="text-xs text-purple-600">
                                  {streakLength}x streak (p={stat?.streakPValue.toFixed(3)})
                                </div>
                              )}
                            </div>
                            <div className="text-right">
                              <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                  className={`h-full transition-all duration-300 ${
                                    isSignificant ? "bg-purple-500" : "bg-blue-500"
                                  }`}
                                  style={{ width: `${Math.min(item.currentProbability, 100)}%` }}
                                />
                              </div>
                              {item.probabilityChange !== 0 && (
                                <div
                                  className={`text-xs ${item.probabilityChange > 0 ? "text-green-500" : "text-red-500"}`}
                                >
                                  {item.probabilityChange > 0 ? "↑" : "↓"}
                                  {Math.abs(item.probabilityChange).toFixed(1)}%
                                </div>
                              )}
                            </div>
                          </Button>
                        )
                      })}
                  </div>

                  {itemStats.filter((item) => item.remaining > 0).length === 0 && (
                    <div className="text-center text-gray-500 py-8">No items available. Add items in Settings.</div>
                  )}
                </div>
              )}

              <div className="text-xs text-gray-500 space-y-1 pt-4 border-t">
                <div>Shortcuts:</div>
                <div>• Click item → Enter cost → Enter to save</div>
                <div>• Escape to cancel selection</div>
                <div>• Ctrl + 1-9: Quick select item</div>
              </div>
            </CardContent>
          </Card>

          {/* Live Odds & Stats Panel */}
          <Card className="border-2 border-green-200">
            <CardHeader className="bg-green-50">
              <CardTitle>Live Odds & Stats</CardTitle>
              <div className="grid grid-cols-2 gap-6 text-sm mb-4">
                <div className="space-y-3">
                  <div className="text-gray-600 font-medium">Session Stats</div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <div className="text-gray-500">Total Spins</div>
                      <div className="font-bold text-lg">{sessionStats.totalSpins}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Revenue</div>
                      <div className="font-bold text-lg text-green-600">${sessionStats.totalRevenue.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Profit</div>
                      <div
                        className={`font-bold text-lg ${sessionStats.grossProfit >= 0 ? "text-green-600" : "text-red-600"}`}
                      >
                        ${sessionStats.grossProfit.toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="text-gray-600 font-medium">Item Totals</div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-gray-500">Total Items</div>
                      <div className="font-bold text-lg">{sessionStats.totalItems}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Items Drawn</div>
                      <div className="font-bold text-lg">{sessionStats.itemsDrawn}</div>
                    </div>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Remaining</TableHead>
                    <TableHead>Probability</TableHead>
                    <TableHead className="text-right">MSRP</TableHead>
                    <TableHead className="text-right">EV</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itemStats.map((item) => {
                    const isSignificant = item.isSignificant

                    return (
                      <TableRow key={item.id} className={isSignificant ? "bg-purple-50" : ""}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-1">
                            {item.name}
                            {isSignificant && <AlertTriangle className="h-3 w-3 text-purple-500" />}
                          </div>
                          {item.streakLength > 0 && (
                            <div className="text-xs text-purple-600">{item.streakLength}x streak</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={item.remaining > 0 ? "default" : "secondary"}>{item.remaining}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium w-12">{item.currentProbability.toFixed(1)}%</span>
                            <Progress
                              value={item.currentProbability}
                              className={`flex-1 ${isSignificant ? "bg-purple-100" : ""}`}
                            />
                            {item.probabilityChange !== 0 && (
                              <span
                                className={`text-xs ${item.probabilityChange > 0 ? "text-green-500" : "text-red-500"}`}
                              >
                                {item.probabilityChange > 0 ? "↑" : "↓"}
                                {Math.abs(item.probabilityChange).toFixed(1)}%
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="text-sm font-medium">${item.msrp.toFixed(2)}</div>
                          {item.actualDraws > 0 && (
                            <div className="text-xs text-gray-500">COGS: ${item.totalCOGS.toFixed(2)}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className={`text-sm font-medium ${item.expectedValue >= 0 ? 'text-green-600' : 'text-red-600'}`}>${item.expectedValue.toFixed(2)}</div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Full-Width History Panel */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Spin History</CardTitle>
              <div className="relative w-64">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Filter history..."
                  value={historyFilter}
                  onChange={(e) => setHistoryFilter(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-96 overflow-y-auto border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Spin Cost</TableHead>
                    <TableHead>Item MSRP</TableHead>
                    <TableHead>P&L</TableHead>
                    <TableHead>Probability</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredHistory.map((spin, index) => {
                    // Find the item stats at the time of this spin
                    const itemStat = itemStats.find((stat) => stat.id === spin.itemId)
                    const isSignificant = itemStat?.isSignificant
                    const profitLoss = spin.cost - spin.itemMSRP

                    return (
                      <TableRow key={spin.id} className={index === 0 ? "bg-blue-50" : ""}>
                        <TableCell className="text-sm text-gray-500">{spin.timestamp.toLocaleTimeString()}</TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-1">
                            {spin.itemName}
                            {isSignificant && <AlertTriangle className="h-3 w-3 text-purple-500" />}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium text-green-600">${spin.cost.toFixed(2)}</TableCell>
                        <TableCell className="text-red-600">${spin.itemMSRP.toFixed(2)}</TableCell>
                        <TableCell className={`font-medium ${profitLoss >= 0 ? "text-green-600" : "text-red-600"}`}>
                          ${profitLoss.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-sm text-gray-500">{spin.probabilityAtSpin.toFixed(1)}%</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0">
                              <Edit2 className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                              onClick={() => {
                                setSpinHistory((prev) => prev.filter((s) => s.id !== spin.id))
                                // Restore item count
                                setWheelItems((prev) =>
                                  prev.map((item) =>
                                    item.id === spin.itemId ? { ...item, remaining: item.remaining + 1 } : item,
                                  ),
                                )
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  {filteredHistory.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-gray-500 py-8">
                        {spinHistory.length === 0 ? "No spins recorded yet" : "No matching entries"}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Footer */}
      <div className="bg-white border-t px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="text-sm text-gray-600">
            Session Duration: <span className="font-mono font-medium">{sessionDuration}</span>
          </div>
          <div className="text-sm text-gray-600">
            Total Revenue: <span className="font-medium text-green-600">${sessionStats.totalRevenue.toFixed(2)}</span>
          </div>
          <div className="text-sm text-gray-600">
            Gross Profit:{" "}
            <span className={`font-medium ${sessionStats.grossProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
              ${sessionStats.grossProfit.toFixed(2)}
            </span>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV} disabled={spinHistory.length === 0}>
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </Button>
      </div>
    </div>
  )
}
