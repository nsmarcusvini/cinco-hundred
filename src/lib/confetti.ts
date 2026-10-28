const COLORS = ['#e8b44c', '#12a150', '#0b3d2e', '#2563eb', '#db2777']

/** Confete leve (Web Animations, só transform/opacity). Não roda com "reduzir movimento". */
export function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const layer = document.createElement('div')
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:70;overflow:hidden'
  document.body.appendChild(layer)
  for (let i = 0; i < 36; i++) {
    const piece = document.createElement('span')
    const size = 6 + Math.random() * 6
    piece.style.cssText = `position:absolute;top:-12px;left:${Math.random() * 100}%;width:${size}px;height:${size}px;border-radius:2px;background:${COLORS[i % COLORS.length]}`
    layer.appendChild(piece)
    piece.animate(
      [
        { transform: 'translate3d(0,0,0) rotate(0)', opacity: 1 },
        { transform: `translate3d(${(Math.random() - 0.5) * 160}px, ${innerHeight * (0.7 + Math.random() * 0.4)}px, 0) rotate(${Math.random() * 720}deg)`, opacity: 0 },
      ],
      { duration: 1400 + Math.random() * 600, easing: 'cubic-bezier(.2,.6,.4,1)', delay: Math.random() * 150, fill: 'forwards' },
    )
  }
  setTimeout(() => layer.remove(), 2400)
}
