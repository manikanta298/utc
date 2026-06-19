/**
 * GST Calculation Logic
 * Same State → CGST + SGST (each = gst_rate / 2)
 * Different State → IGST (= gst_rate)
 */

/**
 * Calculate tax for a single item
 * @param {number} amount - taxable amount (price × qty)
 * @param {number} gstRate - GST rate percentage (e.g. 18)
 * @param {string} taxType - 'CGST_SGST' or 'IGST'
 */
const calculateItemTax = (amount, gstRate, taxType) => {
  const taxAmount = (amount * gstRate) / 100;
  if (taxType === 'CGST_SGST') {
    return {
      cgst: +(taxAmount / 2).toFixed(2),
      sgst: +(taxAmount / 2).toFixed(2),
      igst: 0,
      total: +taxAmount.toFixed(2),
    };
  }
  return {
    cgst: 0,
    sgst: 0,
    igst: +taxAmount.toFixed(2),
    total: +taxAmount.toFixed(2),
  };
};

/**
 * Determine tax type from states
 * @param {string} franchiseState - franchise registered state
 * @param {string} customerState - customer/delivery state (can be null → use franchise state)
 */
const determineTaxType = (franchiseState, customerState) => {
  if (!customerState) return 'CGST_SGST'; // default intra-state
  return franchiseState.trim().toLowerCase() === customerState.trim().toLowerCase()
    ? 'CGST_SGST'
    : 'IGST';
};

/**
 * Calculate full order taxes
 * @param {Array} items - [{price, quantity, gst_rate}]
 * @param {string} taxType - 'CGST_SGST' | 'IGST'
 * @returns { subTotal, cgst, sgst, igst, totalTax, grossTotal }
 */
const calculateOrderTax = (items, taxType) => {
  let subTotal = 0;
  let cgst = 0;
  let sgst = 0;
  let igst = 0;

  items.forEach((item) => {
    const itemTotal = +(item.price * item.quantity).toFixed(2);
    subTotal += itemTotal;
    const tax = calculateItemTax(itemTotal, item.gst_rate, taxType);
    cgst += tax.cgst;
    sgst += tax.sgst;
    igst += tax.igst;
  });

  const totalTax = +(cgst + sgst + igst).toFixed(2);
  const grossTotal = +(subTotal + totalTax).toFixed(2);

  return {
    subTotal: +subTotal.toFixed(2),
    cgst: +cgst.toFixed(2),
    sgst: +sgst.toFixed(2),
    igst: +igst.toFixed(2),
    totalTax,
    grossTotal,
  };
};

/**
 * Loyalty: calculate points earned from bill amount
 * Rs.100 = 10 points (ratio 1:0.1)
 */
const POINTS_PER_RUPEE = 0.1;
const RUPEES_PER_POINT = 0.1; // 1 point = Rs.0.10 discount

const calculatePointsEarned = (billAmount) => Math.floor(billAmount * POINTS_PER_RUPEE);
const calculatePointsValue = (points) => +(points * RUPEES_PER_POINT).toFixed(2);

module.exports = {
  calculateItemTax,
  determineTaxType,
  calculateOrderTax,
  calculatePointsEarned,
  calculatePointsValue,
  POINTS_PER_RUPEE,
  RUPEES_PER_POINT,
};
