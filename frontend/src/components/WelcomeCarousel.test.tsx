/**
 * WelcomeCarousel — Test Suite
 *
 * Covers:
 *   1. Carousel renders on first load (empty localStorage)
 *   2. Carousel is NOT rendered when hasSeenWelcomeCarousel === 'true'
 *   3. "Don't show again" checkbox + close correctly persists to localStorage
 *   4. Next → / ← Back slide navigation
 *
 * All localStorage interactions are tested through a thin `CarouselHost` wrapper
 * that mirrors the exact logic in Home.tsx, ensuring the tests reflect real usage.
 */

import React, { useState, act } from 'react'
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import WelcomeCarousel from './WelcomeCarousel'

// ─── Constants ────────────────────────────────────────────────────────────────

const LS_KEY = 'hasSeenWelcomeCarousel'
const TEST_USER = 'PokerBot123'

// ─── Helper: mirrors Home.tsx carousel mounting logic ─────────────────────────

interface CarouselHostProps {
  /** Pre-seed localStorage before the component mounts */
  initialLsValue?: string
  onUpgrade?: (persist: boolean) => void
}

/**
 * Thin wrapper that replicates the visibility + localStorage logic from Home.tsx.
 * This lets us test the full onboarding flow (gating + carousel behavior)
 * without depending on the full Home component and its API calls.
 */
function CarouselHost({ initialLsValue, onUpgrade }: CarouselHostProps) {
  // Mirrors: useState(() => localStorage.getItem('hasSeenWelcomeCarousel') !== 'true')
  const [show, setShow] = useState<boolean>(
    () => localStorage.getItem(LS_KEY) !== 'true'
  )

  function handleClose(persist: boolean) {
    if (persist) localStorage.setItem(LS_KEY, 'true')
    setShow(false)
  }

  function handleUpgrade(persist: boolean) {
    if (persist) localStorage.setItem(LS_KEY, 'true')
    setShow(false)
    onUpgrade?.(persist)
  }

  if (!show) return <div data-testid="carousel-absent" />

  return (
    <WelcomeCarousel
      userName={TEST_USER}
      onClose={handleClose}
      onUpgrade={handleUpgrade}
    />
  )
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.runAllTimers()
  vi.useRealTimers()
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WelcomeCarousel — visibility', () => {
  /**
   * Test 1: Carousel renders on first load when localStorage is empty.
   *
   * A brand-new user has no 'hasSeenWelcomeCarousel' key. The carousel should
   * be visible and show the slide 1 greeting with their username.
   */
  it('renders on first load when localStorage is empty', () => {
    // localStorage is clear (ensured by beforeEach)
    expect(localStorage.getItem(LS_KEY)).toBeNull()

    render(<CarouselHost />)

    // The overlay with data-testid="welcome-carousel" must be present
    expect(screen.getByTestId('welcome-carousel')).toBeInTheDocument()

    // Slide 1 headline should include the username
    expect(screen.getByText(/The Arena Awaits/i)).toBeInTheDocument()
    expect(screen.getByText(new RegExp(TEST_USER, 'i'))).toBeInTheDocument()
  })

  /**
   * Test 2: Carousel does NOT render when hasSeenWelcomeCarousel is 'true'.
   *
   * A returning user who has already completed onboarding should never see
   * the carousel again, even on a fresh page load.
   */
  it('does NOT render when hasSeenWelcomeCarousel is already "true"', () => {
    localStorage.setItem(LS_KEY, 'true')

    render(<CarouselHost />)

    // The carousel overlay must be absent from the DOM
    expect(screen.queryByTestId('welcome-carousel')).not.toBeInTheDocument()

    // The "absent" placeholder should be present instead
    expect(screen.getByTestId('carousel-absent')).toBeInTheDocument()
  })
})

describe('WelcomeCarousel — localStorage persistence', () => {
  /**
   * Test 3a: Closing WITHOUT checking "Don't show again" does NOT set localStorage.
   *
   * The user dismisses the carousel without opting out of future views. On the
   * next load, the carousel should appear again.
   */
  it('closing without checkbox checked does NOT set localStorage', async () => {
    render(<CarouselHost />)

    // Close without checking the box — X button
    fireEvent.click(screen.getByTestId('carousel-close'))

    // Advance past the 260ms fade-out timer
    vi.runAllTimers()

    // localStorage must still be unset
    expect(localStorage.getItem(LS_KEY)).toBeNull()
  })

  /**
   * Test 3b: Checking "Don't show again" on the final slide then clicking
   * "Build Your First Bot" sets localStorage to 'true'.
   *
   * This is the primary persistence path: the user explicitly opts out of
   * future onboarding views and completes the flow.
   */
  it('checkbox + Build Your First Bot sets localStorage to "true"', async () => {
    render(<CarouselHost />)

    // Navigate to Slide 4 (the final slide with the checkbox)
    fireEvent.click(screen.getByTestId('carousel-next')) // → slide 2
    fireEvent.click(screen.getByTestId('carousel-next')) // → slide 3
    fireEvent.click(screen.getByTestId('carousel-next')) // → slide 4

    // The "Don't show again" checkbox should now be visible
    const checkbox = screen.getByTestId('carousel-dont-show') as HTMLInputElement
    expect(checkbox).toBeInTheDocument()
    expect(checkbox.checked).toBe(false)

    // Check it
    fireEvent.click(checkbox)
    expect(checkbox.checked).toBe(true)

    // Click the primary CTA
    fireEvent.click(screen.getByTestId('carousel-build-bot'))

    // Advance past the 260ms fade-out timer, flushing React state updates
    await act(async () => { vi.runAllTimers() })

    // localStorage must now be set
    expect(localStorage.getItem(LS_KEY)).toBe('true')

    // The carousel must be removed from the DOM
    expect(screen.queryByTestId('welcome-carousel')).not.toBeInTheDocument()
  })

  /**
   * Test 3c: "Build Your First Bot" ALWAYS sets localStorage — even without the checkbox.
   *
   * Completing the full flow is treated as an implicit "I've seen onboarding" signal
   * regardless of whether the checkbox was checked.
   */
  it('"Build Your First Bot" always sets localStorage regardless of checkbox', async () => {
    render(<CarouselHost />)

    // Navigate to Slide 4
    fireEvent.click(screen.getByTestId('carousel-next'))
    fireEvent.click(screen.getByTestId('carousel-next'))
    fireEvent.click(screen.getByTestId('carousel-next'))

    // Do NOT check the checkbox
    const checkbox = screen.getByTestId('carousel-dont-show') as HTMLInputElement
    expect(checkbox.checked).toBe(false)

    // Click "Build Your First Bot"
    fireEvent.click(screen.getByTestId('carousel-build-bot'))
    vi.runAllTimers()

    // localStorage is still set (hardcoded persist=true in handleBuildBot)
    expect(localStorage.getItem(LS_KEY)).toBe('true')
  })
})

describe('WelcomeCarousel — slide navigation', () => {
  /**
   * Test 4a: Next → advances through all four slides in order.
   *
   * Verifies that each slide's unique headline appears after pressing Next,
   * and that the Back button is absent on slide 1.
   */
  it('Next advances through slides 1 → 2 → 3 → 4', () => {
    render(<CarouselHost />)

    // Slide 1
    expect(screen.getByText(/The Arena Awaits/i)).toBeInTheDocument()
    expect(screen.queryByTestId('carousel-back')).not.toBeInTheDocument()

    // → Slide 2
    fireEvent.click(screen.getByTestId('carousel-next'))
    expect(screen.getByText(/Fight for Glory/i)).toBeInTheDocument()
    expect(screen.getByTestId('carousel-back')).toBeInTheDocument()

    // → Slide 3 (check the unique full-width upgrade CTA, not the header which duplicates the subheader text)
    fireEvent.click(screen.getByTestId('carousel-next'))
    expect(screen.getByText(/Upgrade to Pro.*Unlock All 5 Bots/i)).toBeInTheDocument()

    // → Slide 4
    fireEvent.click(screen.getByTestId('carousel-next'))
    expect(screen.getByText(/Analyze & Optimize/i)).toBeInTheDocument()

    // On slide 4, "Next →" is replaced by "Build Your First Bot"
    expect(screen.queryByTestId('carousel-next')).not.toBeInTheDocument()
    expect(screen.getByTestId('carousel-build-bot')).toBeInTheDocument()

    // "Don't show again" checkbox appears only on the final slide
    expect(screen.getByTestId('carousel-dont-show')).toBeInTheDocument()
  })

  /**
   * Test 4b: ← Back returns to the previous slide.
   *
   * Navigates to slide 3 then back to slide 2 and slide 1, verifying
   * that the correct content is shown and that Back disappears on slide 1.
   */
  it('Back returns to the previous slide', () => {
    render(<CarouselHost />)

    // Advance to slide 3 (use unique full-width upgrade CTA text to avoid header/subheader ambiguity)
    fireEvent.click(screen.getByTestId('carousel-next'))
    fireEvent.click(screen.getByTestId('carousel-next'))
    expect(screen.getByText(/Upgrade to Pro.*Unlock All 5 Bots/i)).toBeInTheDocument()

    // Go back to slide 2
    fireEvent.click(screen.getByTestId('carousel-back'))
    expect(screen.getByText(/Fight for Glory/i)).toBeInTheDocument()

    // Go back to slide 1
    fireEvent.click(screen.getByTestId('carousel-back'))
    expect(screen.getByText(/The Arena Awaits/i)).toBeInTheDocument()

    // Back button must be absent on slide 1
    expect(screen.queryByTestId('carousel-back')).not.toBeInTheDocument()
  })

  /**
   * Test 4c: Dot indicators are clickable and jump directly to any slide.
   */
  it('clicking dot indicators jumps directly to that slide', () => {
    render(<CarouselHost />)

    // The dots are rendered as divs with onClick handlers inside the header.
    // There are 4 dots; click the 4th one (index 3) to jump to slide 4.
    // We identify them by their position in the dot container.
    const dots = screen.getByTestId('welcome-carousel')
      .querySelectorAll('[style*="border-radius: 4px"]')

    // There should be exactly 4 dots
    expect(dots).toHaveLength(4)

    // Click the last dot → should jump to slide 4 (Lab)
    fireEvent.click(dots[3])
    expect(screen.getByText(/Analyze & Optimize/i)).toBeInTheDocument()

    // Click the first dot → back to slide 1
    fireEvent.click(dots[0])
    expect(screen.getByText(/The Arena Awaits/i)).toBeInTheDocument()
  })
})

describe('WelcomeCarousel — closing animation', () => {
  /**
   * Test 5: Clicking X triggers the fade-out; onClose is called after 260ms.
   *
   * The carousel should still be in the DOM immediately after clicking X
   * (animation is playing), and removed only after the timer fires.
   */
  it('X button triggers 260ms fade-out before onClose fires', async () => {
    const onClose = vi.fn()

    render(
      <WelcomeCarousel
        userName={TEST_USER}
        onClose={onClose}
        onUpgrade={vi.fn()}
      />
    )

    fireEvent.click(screen.getByTestId('carousel-close'))

    // onClose must not have been called yet (animation is still playing)
    expect(onClose).not.toHaveBeenCalled()

    // Advance past the 260ms timeout
    vi.advanceTimersByTime(260)

    expect(onClose).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledWith(false) // dontShow defaults to false
  })
})
