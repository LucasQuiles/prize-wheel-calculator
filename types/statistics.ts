export interface ItemStats {
  id: string
  name: string
  initialCount: number
  remaining: number
  currentProbability: number
  initialProbability: number
  probabilityChange: number
  streakLength: number
  streakPValue: number
  surpriseFactor: number
  isSignificant: boolean
  ewma: number
  ewmaDeviation: number
  actualDraws: number
  expectedDraws: number
  overdueScore: number
  overduePValue: number
  isOverdue: boolean
  momentumScore: number
  predictionScore: number
  recentDraws: number
  msrp: number
  totalCOGS: number // Total cost of goods sold for this item
  expectedValue: number
}

export interface SessionStats {
  totalSpins: number
  totalCost: number
  avgCostPerSpin: number
  expectedValuePerSpin: number
  totalItems: number
  itemsDrawn: number
  mostLikelyItem: ItemStats | null
  leastLikelyItem: ItemStats | null
  mostSignificantStreak: ItemStats | null
  mostOverdueItem: ItemStats | null
  neverDrawnItems: ItemStats[]
  recentItems: string[]
  progressPercent: number
  bestPrediction: ItemStats | null
  // PNL Stats
  totalRevenue: number
  totalCOGS: number
  grossProfit: number
  profitMargin: number
  avgRevenuePerItem: number
  avgCOGSPerItem: number
  mostProfitableItem: ItemStats | null
  leastProfitableItem: ItemStats | null
  bestEVItem: ItemStats | null
}

export interface PNLBreakdown {
  itemName: string
  quantityDrawn: number
  msrp: number
  totalCOGS: number
  revenueFromItem: number
  profitFromItem: number
  profitMargin: number
}
