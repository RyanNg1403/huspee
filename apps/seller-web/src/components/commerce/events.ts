/** Tells the Seller Centre shell that order or return counts may have changed. */
export function notifyOrdersChanged() {
  window.dispatchEvent(new Event('huspee:orders-changed'));
}
