/**
 * Wheel-এর গণিত (pure functions — ক্লায়েন্ট ও টেস্ট দুই জায়গাতেই চলে)।
 *
 * কোণ মাপা হয় ১২টার দিক (উপর) থেকে ঘড়ির কাঁটার দিকে।
 * segment i আছে [i*step, (i+1)*step] কোণের মধ্যে। পয়েন্টার সবসময় উপরে (০°)।
 */

export const SEGMENTS = 8;
export const STEP = 360 / SEGMENTS;

/** উপরের দিক থেকে ঘড়ির কাঁটার কোণ → SVG কার্টেসিয়ান বিন্দু */
export function polar(cx: number, cy: number, r: number, angleDeg: number): [number, number] {
  const a = (angleDeg * Math.PI) / 180;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
}

/** একটি segment-এর SVG path */
export function segmentPath(cx: number, cy: number, r: number, index: number): string {
  const [x1, y1] = polar(cx, cy, r, index * STEP);
  const [x2, y2] = polar(cx, cy, r, (index + 1) * STEP);
  // STEP < 180 তাই large-arc-flag সবসময় 0; sweep-flag 1 = ঘড়ির কাঁটার দিকে
  return `M ${cx} ${cy} L ${x1.toFixed(3)} ${y1.toFixed(3)} A ${r} ${r} 0 0 1 ${x2.toFixed(3)} ${y2.toFixed(3)} Z`;
}

/**
 * চাকা এখন `current` ডিগ্রিতে আছে (জমানো মান, ০-তে সীমাবদ্ধ নয়)।
 * `index` নম্বর segment-কে পয়েন্টারের নিচে থামাতে নতুন মোট কোণ কত হবে?
 *
 * @param jitter -0.5..0.5; segment-এর ভেতরে কোথায় থামবে (০ = ঠিক মাঝখানে)।
 *               ±0.35-এর বেশি দিলে সীমানার খুব কাছে থামার ঝুঁকি থাকে, তাই ক্ল্যাম্প করা হয়।
 */
export function targetRotation(current: number, index: number, jitter = 0, extraTurns = 6): number {
  const j = Math.max(-0.35, Math.min(0.35, jitter));
  const landing = index * STEP + STEP / 2 + j * STEP; // যে কোণটি পয়েন্টারের নিচে আনতে হবে
  const offset = (((360 - landing) % 360) + 360) % 360; // ঘড়ির কাঁটার দিকে কতটা ঘোরাতে হবে
  const base = Math.floor(current / 360) * 360;
  return base + 360 * extraTurns + offset;
}

/** চাকা `rotation` ডিগ্রিতে থামলে পয়েন্টারের নিচে কোন segment? (যাচাইয়ের জন্য) */
export function segmentUnderPointer(rotation: number): number {
  const pointerAngleOnWheel = (((360 - rotation) % 360) + 360) % 360;
  return Math.floor(pointerAngleOnWheel / STEP) % SEGMENTS;
}
