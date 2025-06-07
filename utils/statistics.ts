/**
 * Statistical utility functions for probability analysis
 */

/**
 * Calculate the conditional probability of drawing an item
 * @param remainingCount Number of the specific item remaining
 * @param totalRemaining Total number of all items remaining
 * @returns Probability as a percentage
 */
export function calculateProbability(remainingCount: number, totalRemaining: number): number {
  if (totalRemaining === 0) return 0
  return (remainingCount / totalRemaining) * 100
}

/**
 * Calculate the relative change in probability compared to initial probability
 * @param currentProb Current probability
 * @param initialProb Initial probability
 * @returns Percentage change
 */
export function calculateProbabilityChange(currentProb: number, initialProb: number): number {
  if (initialProb === 0) return 0
  return ((currentProb - initialProb) / initialProb) * 100
}

/**
 * Calculate the hypergeometric probability of exactly k successes in N draws
 * @param k Number of successes
 * @param N Number of draws
 * @param Cx Initial count of the specific item
 * @param T Total initial items
 * @returns Probability
 */
export function hypergeometricExact(k: number, N: number, Cx: number, T: number): number {
  // Ensure valid inputs
  if (k > Math.min(N, Cx) || k < 0 || N > T) return 0

  // Calculate binomial coefficients
  const numerator = binomialCoefficient(Cx, k) * binomialCoefficient(T - Cx, N - k)
  const denominator = binomialCoefficient(T, N)

  return numerator / denominator
}

/**
 * Calculate the probability of at least k successes in N draws (hypergeometric)
 * @param k Minimum number of successes
 * @param N Number of draws
 * @param Cx Initial count of the specific item
 * @param T Total initial items
 * @returns Probability
 */
export function hypergeometricCumulative(k: number, N: number, Cx: number, T: number): number {
  let probability = 0
  const maxK = Math.min(N, Cx)

  for (let i = k; i <= maxK; i++) {
    probability += hypergeometricExact(i, N, Cx, T)
  }

  return probability
}

/**
 * Calculate the binomial probability of at least k successes in N draws
 * @param k Minimum number of successes
 * @param N Number of draws
 * @param p Probability of success on a single draw
 * @returns Probability
 */
export function binomialCumulative(k: number, N: number, p: number): number {
  let probability = 0

  for (let i = 0; i < k; i++) {
    probability += binomialPMF(i, N, p)
  }

  return 1 - probability
}

/**
 * Calculate the binomial probability mass function
 * @param k Number of successes
 * @param N Number of trials
 * @param p Probability of success on a single trial
 * @returns Probability
 */
export function binomialPMF(k: number, N: number, p: number): number {
  return binomialCoefficient(N, k) * Math.pow(p, k) * Math.pow(1 - p, N - k)
}

/**
 * Calculate the binomial coefficient (n choose k)
 * @param n Total number of items
 * @param k Number of items to choose
 * @returns Binomial coefficient
 */
export function binomialCoefficient(n: number, k: number): number {
  if (k < 0 || k > n) return 0
  if (k === 0 || k === n) return 1

  // Use symmetry to reduce calculations
  if (k > n - k) {
    k = n - k
  }

  let result = 1
  for (let i = 1; i <= k; i++) {
    result *= n - (k - i)
    result /= i
  }

  return result
}

/**
 * Calculate the negative hypergeometric probability (probability that kth success occurs on draw n)
 * @param k Number of successes
 * @param n Draw number
 * @param Cx Initial count of the specific item
 * @param T Total initial items
 * @returns Probability
 */
export function negativeHypergeometric(k: number, n: number, Cx: number, T: number): number {
  if (n < k || k > Cx || n > T) return 0

  const numerator = binomialCoefficient(n - 1, k - 1) * binomialCoefficient(T - n, Cx - k)
  const denominator = binomialCoefficient(T, Cx)

  return numerator / denominator
}

/**
 * Calculate the p-value for a streak (probability of seeing kth success this early or earlier)
 * @param k Number of successes
 * @param n Current draw number
 * @param Cx Initial count of the specific item
 * @param T Total initial items
 * @returns p-value
 */
export function streakPValue(k: number, n: number, Cx: number, T: number): number {
  let pValue = 0

  for (let i = k; i <= n; i++) {
    pValue += negativeHypergeometric(k, i, Cx, T)
  }

  return pValue
}

/**
 * Perform a runs test for randomness
 * @param sequence Binary sequence (1 for item of interest, 0 for others)
 * @returns Z-score and p-value
 */
export function runsTest(sequence: number[]): { zScore: number; pValue: number } {
  const n1 = sequence.filter((x) => x === 1).length
  const n0 = sequence.filter((x) => x === 0).length
  const N = sequence.length

  // Count runs
  let runs = 1
  for (let i = 1; i < N; i++) {
    if (sequence[i] !== sequence[i - 1]) {
      runs++
    }
  }

  // Calculate expected mean and variance
  const mean = (2 * n1 * n0) / N + 1
  const variance = (2 * n1 * n0 * (2 * n1 * n0 - N)) / (N * N * (N - 1))

  // Calculate Z-score
  const zScore = (runs - mean) / Math.sqrt(variance)

  // Calculate p-value (two-tailed)
  const pValue = 2 * (1 - normalCDF(Math.abs(zScore)))

  return { zScore, pValue }
}

/**
 * Calculate the cumulative distribution function for the standard normal distribution
 * @param z Z-score
 * @returns Probability
 */
export function normalCDF(z: number): number {
  // Approximation of the normal CDF
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const d = 0.3989423 * Math.exp((-z * z) / 2)
  const probability = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))

  if (z > 0) {
    return 1 - probability
  } else {
    return probability
  }
}

/**
 * Update an Exponentially Weighted Moving Average
 * @param currentEWMA Current EWMA value
 * @param newObservation New observation (1 or 0)
 * @param alpha Smoothing factor (0 < alpha < 1)
 * @returns Updated EWMA
 */
export function updateEWMA(currentEWMA: number, newObservation: number, alpha: number): number {
  return alpha * newObservation + (1 - alpha) * currentEWMA
}

/**
 * Calculate the surprise factor for a streak
 * @param pValue p-value of the streak
 * @returns Surprise factor (0-10 scale)
 */
export function calculateSurpriseFactor(pValue: number): number {
  if (pValue >= 0.5) return 0
  if (pValue <= 0.0001) return 10

  // Log scale for better visualization
  return Math.min(10, Math.round(-Math.log10(pValue) * 2))
}

/**
 * Determine if a streak is statistically significant
 * @param pValue p-value of the streak
 * @param threshold Significance threshold (default: 0.05)
 * @returns Whether the streak is significant
 */
export function isSignificantStreak(pValue: number, threshold = 0.05): boolean {
  return pValue < threshold
}

/**
 * Calculate expected number of draws for an item given total spins
 * @param initialCount Initial count of the item
 * @param totalInitialItems Total initial items across all types
 * @param totalSpins Total number of spins performed
 * @returns Expected number of draws
 */
export function calculateExpectedDraws(initialCount: number, totalInitialItems: number, totalSpins: number): number {
  if (totalInitialItems === 0) return 0
  return (initialCount / totalInitialItems) * totalSpins
}

/**
 * Calculate how "overdue" an item is (negative means underdrawn, positive means overdrawn)
 * @param actualDraws Actual number of times the item was drawn
 * @param expectedDraws Expected number of draws based on probability
 * @returns Overdue score (negative = underdrawn, positive = overdrawn)
 */
export function calculateOverdueScore(actualDraws: number, expectedDraws: number): number {
  return actualDraws - expectedDraws
}

/**
 * Calculate the statistical significance of being overdue using binomial test
 * @param actualDraws Actual number of draws
 * @param totalSpins Total number of spins
 * @param expectedProbability Expected probability of drawing this item
 * @returns p-value for the underrepresentation
 */
export function calculateOverduePValue(actualDraws: number, totalSpins: number, expectedProbability: number): number {
  if (totalSpins === 0 || expectedProbability === 0) return 1.0

  // Calculate probability of getting actualDraws or fewer successes
  let pValue = 0
  for (let i = 0; i <= actualDraws; i++) {
    pValue += binomialPMF(i, totalSpins, expectedProbability)
  }

  return pValue
}

/**
 * Calculate momentum score based on recent vs distant draws
 * @param recentDraws Number of draws in recent history (e.g., last 10 spins)
 * @param totalDraws Total draws for this item
 * @param recentSpins Number of recent spins to consider
 * @param totalSpins Total spins in session
 * @returns Momentum score (positive = hot, negative = cold)
 */
export function calculateMomentumScore(
  recentDraws: number,
  totalDraws: number,
  recentSpins: number,
  totalSpins: number,
): number {
  if (totalSpins === 0 || recentSpins === 0) return 0

  const recentRate = recentDraws / recentSpins
  const overallRate = totalDraws / totalSpins

  return recentRate - overallRate
}

/**
 * Predict next item likelihood based on multiple factors
 * @param item Item statistics
 * @param totalSpins Total spins in session
 * @param recentSpins Number of recent spins to consider for momentum
 * @returns Prediction score (higher = more likely to be drawn next)
 */
export function calculatePredictionScore(
  item: {
    remaining: number
    initialCount: number
    currentProbability: number
    overdueScore: number
    momentumScore: number
    streakLength: number
  },
  totalSpins: number,
  recentSpins = 10,
): number {
  // Base probability (current odds)
  let score = item.currentProbability

  // Overdue bonus (items that are underrepresented get a boost)
  if (item.overdueScore < 0) {
    score += Math.abs(item.overdueScore) * 5 // Boost underdrawn items
  }

  // Momentum penalty (items on a streak get reduced likelihood)
  if (item.streakLength > 0) {
    score -= item.streakLength * 2 // Reduce likelihood for items on streaks
  }

  // Cold streak bonus (items that haven't been drawn recently)
  if (item.momentumScore < 0) {
    score += Math.abs(item.momentumScore) * 10 // Boost cold items
  }

  return Math.max(0, score)
}
