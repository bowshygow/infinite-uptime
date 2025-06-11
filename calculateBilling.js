function calculateBilling() {
  // ─ Inputs ───────────────────────────────────────────
  const billingStart      = new Date("2025-02-18");
  const billingCycleDate  = 2;          // e.g. billing always on the 2nd
  const billingEnd        = new Date("2026-12-31");
  const billingCycle      = "monthly";// "monthly", "quarterly", "half-yearly"
  const pricePerMonth     = 10;         // ₹10 per unit, per month
  const quantityPerMonth  = 5;          // units consumed in a full month
  const maxQuantity       = 5000000;    // upper limit on total units billed

  // ─ Derived Values ──────────────────────────────────
  const cycleMonths = (billingCycle === "monthly")
                        ? 1
                        : (billingCycle === "quarterly")
                          ? 3
                          : 6;

  const result = [];
  let totalQuantityBilled = 0;    // tracks total “units” billed so far

  // ─ Helpers ──────────────────────────────────────────
  function getDaysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
  }

  /**
   * calculateQuantity(start, end):
   *   - Splits [start…end] over each calendar month
   *   - For each month, computes: activeDays / totalDaysInMonth
   *   - Returns { quantityMonths, monthDetails[] }:
   *       quantityMonths = sum of (activeDays/totalDaysInMonth)
   *       monthDetails[]  = array of { month, active_days, total_days, fraction, partial_units, partial_amount }
   */
  function calculateQuantity(start, end) {
    let quantityMonths = 0;
    let date = new Date(start);
    const monthDetails = [];

    while (date <= end) {
      const year = date.getFullYear();
      const month = date.getMonth();
      const monthStart = new Date(year, month, 1);
      const monthEnd   = new Date(year, month, getDaysInMonth(year, month));

      // periodStart = the later of (date vs. first-of-this-month)
      // periodEnd   = the earlier of (end vs. last-of-this-month)
      const periodStart = date > monthStart ? date : monthStart;
      const periodEnd   = end < monthEnd   ? end  : monthEnd;

      // integer activeDays within this one month
      const activeDays = periodEnd.getDate() - periodStart.getDate() + 1;
      const totalDaysInMonth = getDaysInMonth(year, month);
      const fraction = activeDays / totalDaysInMonth;  // fraction of that month used

      quantityMonths += fraction;

      // record breakdown for logging
      const partialUnits  = fraction * quantityPerMonth;
      const partialAmount = partialUnits * pricePerMonth;

      monthDetails.push({
        month:         `${periodStart.toLocaleString('default', { month: 'short' })} ${year}`,
        active_days:   activeDays,
        total_days:    totalDaysInMonth,
        fraction:      parseFloat(fraction.toFixed(4)),
        partial_units: parseFloat(partialUnits.toFixed(4)),
        partial_amount: parseFloat(partialAmount.toFixed(2))
      });

      // move to first day of next month
      date = new Date(year, month + 1, 1);
    }

    return { quantityMonths, monthDetails };
  }

  // Logs one billing period’s detail, including month-by-month breakdown
  function logCalculation(start, end, quantityMonths, monthDetails) {
    const totalUnits = quantityMonths * quantityPerMonth;
    const totalAmt   = totalUnits * pricePerMonth;

    console.log(`🧮 Billing Period: ${start.toDateString()} → ${end.toDateString()}`);
    console.log(`→ Quantity (in months) = ${quantityMonths.toFixed(4)} months`);
    console.log(`→ Total Units Billed   = ${totalUnits.toFixed(4)} units`);
    console.log(`→ Total Amount         = ₹${totalAmt.toFixed(2)}`);
    console.log("→ Month-wise Breakdown:");
    monthDetails.forEach(m => {
      console.log(
        `   • ${m.month}: ${m.active_days} / ${m.total_days} days → ` +
        `${m.fraction} × ${quantityPerMonth} units = ${m.partial_units.toFixed(4)} units → ` +
        `₹${m.partial_amount.toFixed(2)}`
      );
    });
    console.log("──────────────────────────────────────────────────\n");
  }

  // ── Step 1: Determine first cycle-end date (first occurrence of cycleDate after billingStart) ──
  let firstCycleEnd = new Date(billingStart);
  firstCycleEnd.setDate(billingCycleDate);
  if (firstCycleEnd <= billingStart) {
    firstCycleEnd.setMonth(firstCycleEnd.getMonth() + 1);
  }

  // ── Step 2: First partial period is [billingStart … (firstCycleEnd − 1 day)] ──
  let firstPeriodEnd = new Date(firstCycleEnd.getTime() - 24*60*60*1000);  // one day before firstCycleEnd

  let {
    quantityMonths: firstQtyMonths,
    monthDetails:   firstMonths
  } = calculateQuantity(billingStart, firstPeriodEnd);

  // Convert months → units, cap by maxQuantity if needed
  let firstUnits = firstQtyMonths * quantityPerMonth;
  if (totalQuantityBilled + firstUnits > maxQuantity) {
    firstUnits      = maxQuantity - totalQuantityBilled;
    firstQtyMonths  = firstUnits / quantityPerMonth;
  }
  let firstAmt = firstUnits * pricePerMonth;

  logCalculation(billingStart, firstPeriodEnd, firstQtyMonths, firstMonths);

  result.push({
    billing_start:    billingStart.toISOString().split("T")[0],
    billing_end:      firstPeriodEnd.toISOString().split("T")[0],
    quantity_months:  parseFloat(firstQtyMonths.toFixed(4)),
    units_billed:     parseFloat(firstUnits.toFixed(4)),
    amount:           parseFloat(firstAmt.toFixed(2)),
    prorated:         true
  });

  totalQuantityBilled += firstUnits;
  if (totalQuantityBilled >= maxQuantity) {
    // Log final JSON
    console.log("📊 Final Billing Summary (JSON):\n", JSON.stringify(result, null, 2));
    return result;
  }

  // ── Step 3: Loop through full/partial cycles from firstCycleEnd to billingEnd ──
  let cycleStart = new Date(firstCycleEnd);

  while (cycleStart <= billingEnd) {
    let nextCycleStart = new Date(cycleStart);
    nextCycleStart.setMonth(cycleStart.getMonth() + cycleMonths);
    let cycleEnd = new Date(nextCycleStart.getTime() - 24*60*60*1000);

    // If this cycle‐end would exceed billingEnd, cap it
    if (cycleEnd > billingEnd) {
      cycleEnd = billingEnd;
    }

    let {
      quantityMonths: qtyMonths,
      monthDetails
    } = calculateQuantity(cycleStart, cycleEnd);

    let units = qtyMonths * quantityPerMonth;
    if (totalQuantityBilled + units > maxQuantity) {
      units    = maxQuantity - totalQuantityBilled;
      qtyMonths = units / quantityPerMonth;
    }
    let amt = units * pricePerMonth;

    logCalculation(cycleStart, cycleEnd, qtyMonths, monthDetails);

    result.push({
      billing_start:    cycleStart.toISOString().split("T")[0],
      billing_end:      cycleEnd.toISOString().split("T")[0],
      quantity_months:  parseFloat(qtyMonths.toFixed(4)),
      units_billed:     parseFloat(units.toFixed(4)),
      amount:           parseFloat(amt.toFixed(2)),
      prorated:         (qtyMonths !== cycleMonths)
    });

    totalQuantityBilled += units;
    if (totalQuantityBilled >= maxQuantity) break;

    cycleStart = new Date(nextCycleStart);
  }

  // ── Final Logging ───────────────────────────────────
  console.log("📊 Final Billing Summary (JSON):\n", JSON.stringify(result, null, 2));
  return result;
}

// Run it and capture the returned array if desired:
const billingJSON = calculateBilling();
