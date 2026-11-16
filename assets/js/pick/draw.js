// 남은 수량 비례 추첨 — DOM·three 의존 없는 순수 함수
export const PRIZE_KEYS = ['towel', 'cup', 'bag'];

const leftOf = (stock, k) => Math.max(0, (stock[k] && stock[k].left) | 0);

export function totalLeft(stock) {
  return PRIZE_KEYS.reduce((sum, k) => sum + leftOf(stock, k), 0);
}

// 확률 = left_i / Σleft. 남은 게 없으면 null.
export function pickPrize(stock, rand = Math.random) {
  const total = totalLeft(stock);
  if (total <= 0) return null;
  let r = rand() * total;
  for (const k of PRIZE_KEYS) {
    const left = leftOf(stock, k);
    if (r < left) return k;
    r -= left;
  }
  // 부동소수 오차로 끝까지 온 경우: 재고가 남은 마지막 경품
  for (let i = PRIZE_KEYS.length - 1; i >= 0; i--) {
    if (leftOf(stock, PRIZE_KEYS[i]) > 0) return PRIZE_KEYS[i];
  }
  return null;
}
