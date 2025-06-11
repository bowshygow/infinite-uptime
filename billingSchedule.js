/**
 * Generates a billing schedule with accurate, month-by-month proration.
 *
 * @param {string|Date} billingStart       - ISO string or Date when billing begins.
 * @param {number}       billingCycleDate  - Day of month (1–28) for the cycle date.
 * @param {string|Date} billingEnd         - ISO string or Date when billing stops.
 * @param {"monthly"|"quarterly"|"half-yearly"} billingCycle
 *                                            - Billing frequency.
 * @param {number} pricePerMonth           - ₹ charged per unit per month.
 * @param {number} quantityPerMonth        - Units consumed in a full month.
 * @param {number} maxQuantity             - Cap on total units billed.
 * @returns {Array<Object>}                - Array of billing entries.
 */
function generateBillingSchedule(
    billingStart,
    billingCycleDate,
    billingEnd,
    billingCycle,
    pricePerMonth,
    quantityPerMonth,
    maxQuantity
  ) {
    // Normalize dates
    billingStart = new Date(billingStart);
    billingEnd   = new Date(billingEnd);
  
    // Determine how many months each cycle spans
    const cycleMonths = billingCycle === "monthly"
      ? 1
      : billingCycle === "quarterly"
        ? 3
        : 6;
  
    const result = [];
    let totalUnitsBilled = 0;
  
    // Helper to get days in a month
    function getDaysInMonth(year, month) {
      return new Date(year, month + 1, 0).getDate();
    }
  
    // Splits [start…end] across calendar months and returns quantity in months + breakdown
    function calculateQuantity(start, end) {
      let quantityMonths = 0;
      let date = new Date(start);
      const monthDetails = [];
  
      while (date <= end) {
        const y = date.getFullYear();
        const m = date.getMonth();
        const monthStart = new Date(y, m, 1);
        const monthEnd   = new Date(y, m, getDaysInMonth(y, m));
  
        const periodStart = date > monthStart ? date : monthStart;
        const periodEnd   = end  < monthEnd  ? end  : monthEnd;
  
        // Integer active days
        const activeDays       = periodEnd.getDate() - periodStart.getDate() + 1;
        const totalDaysInMonth = getDaysInMonth(y, m);
        const fraction         = activeDays / totalDaysInMonth;
  
        quantityMonths += fraction;
  
        monthDetails.push({
          month:          `${periodStart.toLocaleString('default',{month:'short'})} ${y}`,
          active_days:    activeDays,
          total_days:     totalDaysInMonth,
          fraction:       +fraction.toFixed(4),
          partial_amount: +(fraction * quantityPerMonth * pricePerMonth).toFixed(2)
        });
  
        // Move to next month
        date = new Date(y, m + 1, 1);
      }
  
      return { quantityMonths, monthDetails };
    }
  
    // Function to log each period's details
    function logCalculation(start, end, qtyMonths, monthDetails) {
      const units = qtyMonths * quantityPerMonth;
      const amt   = units * pricePerMonth;
      console.log(`🧮 Billing Period: ${start.toDateString()} → ${end.toDateString()}`);
      console.log(`→ Quantity (months) = ${qtyMonths.toFixed(4)}`);
      console.log(`→ Units billed     = ${units.toFixed(4)}`);
      console.log(`→ Amount           = ₹${amt.toFixed(2)}`);
      console.log("→ Month-wise Breakdown:");
      monthDetails.forEach(m => {
        console.log(
          `   • ${m.month}: ${m.active_days}/${m.total_days} days → ` +
          `${m.fraction} × ${quantityPerMonth} units × ₹${pricePerMonth} = ₹${m.partial_amount}`
        );
      });
      console.log("──────────────────────────────────────────────────\n");
    }
  
    // Step 1: Determine the first cycle-end date
    let firstCycleEnd = new Date(billingStart);
    firstCycleEnd.setDate(billingCycleDate);
    if (firstCycleEnd <= billingStart) {
      firstCycleEnd.setMonth(firstCycleEnd.getMonth() + 1);
    }
    // First period runs until the day before firstCycleEnd
    const firstPeriodEnd = new Date(firstCycleEnd.getTime() - 24*60*60*1000);
  
    // Step 2: Calculate first (prorated) period
    let { quantityMonths: fq, monthDetails: fmd } = calculateQuantity(billingStart, firstPeriodEnd);
    let units = fq * quantityPerMonth;
    if (totalUnitsBilled + units > maxQuantity) {
      units = maxQuantity - totalUnitsBilled;
      fq = units / quantityPerMonth;
    }
    const amt0 = units * pricePerMonth;
  
    logCalculation(billingStart, firstPeriodEnd, fq, fmd);
    result.push({
      billing_start:   billingStart.toISOString().slice(0,10),
      billing_end:     firstPeriodEnd.toISOString().slice(0,10),
      quantity_months: +fq.toFixed(4),
      units_billed:    +units.toFixed(4),
      amount:          +amt0.toFixed(2),
      prorated:        true,
      breakdown:       fmd
    });
    totalUnitsBilled += units;
    if (totalUnitsBilled >= maxQuantity) return result;
  
    // Step 3: Loop through full/partial cycles
    let cycleStart = new Date(firstCycleEnd);
    while (cycleStart <= billingEnd && totalUnitsBilled < maxQuantity) {
      let nextCycleStart = new Date(cycleStart);
      nextCycleStart.setMonth(cycleStart.getMonth() + cycleMonths);
      let cycleEnd = new Date(nextCycleStart.getTime() - 24*60*60*1000);
      if (cycleEnd > billingEnd) cycleEnd = billingEnd;
  
      let { quantityMonths: q, monthDetails: md } = calculateQuantity(cycleStart, cycleEnd);
      let u = q * quantityPerMonth;
      if (totalUnitsBilled + u > maxQuantity) {
        u = maxQuantity - totalUnitsBilled;
        q = u / quantityPerMonth;
      }
      const a = u * pricePerMonth;
  
      logCalculation(cycleStart, cycleEnd, q, md);
      result.push({
        billing_start:   cycleStart.toISOString().slice(0,10),
        billing_end:     cycleEnd.toISOString().slice(0,10),
        quantity_months: +q.toFixed(4),
        units_billed:    +u.toFixed(4),
        amount:          +a.toFixed(2),
        prorated:        (q !== cycleMonths),
        breakdown:       md
      });
  
      totalUnitsBilled += u;
      cycleStart = nextCycleStart;
    }
  
    return result;
  }
  
  // ── Example Invocation ─────────────────────────────────────────
  const schedule = generateBillingSchedule(
    "2025-02-15",   // billingStart
    2,              // billingCycleDate
    "2025-12-31",   // billingEnd
    "quarterly",    // billingCycle
    10,             // pricePerMonth
    5,              // quantityPerMonth
    5000000         // maxQuantity
  );
  
  // Output the JSON result
  console.log(JSON.stringify(schedule, null, 2));
  