/** Petit effet de célébration (confettis) déclenché depuis un point d'origine à l'écran.
 * Implémenté avec la Web Animations API — pas de dépendance externe. */

const CONFETTI_COLORS = ["#f59e0b", "#22c55e", "#3b82f6", "#ec4899", "#a855f7", "#facc15"];

interface ConfettiOrigin {
  x: number;
  y: number;
}

export function fireConfettiBurst(origin: ConfettiOrigin, particleCount = 28): void {
  if (typeof document === "undefined" || typeof Element === "undefined" || !Element.prototype.animate) {
    return;
  }

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.inset = "0";
  container.style.pointerEvents = "none";
  container.style.zIndex = "9999";
  document.body.appendChild(container);

  let pending = particleCount;
  const finish = () => {
    pending -= 1;
    if (pending <= 0) {
      container.remove();
    }
  };

  for (let i = 0; i < particleCount; i += 1) {
    const particle = document.createElement("div");
    const size = 5 + Math.random() * 5;
    const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    particle.style.position = "absolute";
    particle.style.left = `${origin.x}px`;
    particle.style.top = `${origin.y}px`;
    particle.style.width = `${size}px`;
    particle.style.height = `${size}px`;
    particle.style.background = color;
    particle.style.borderRadius = Math.random() > 0.5 ? "9999px" : "2px";
    container.appendChild(particle);

    const angle = Math.random() * Math.PI * 2;
    const distance = 60 + Math.random() * 100;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance - 40;
    const rotation = (Math.random() - 0.5) * 720;
    const duration = 700 + Math.random() * 500;

    const animation = particle.animate(
      [
        { transform: "translate(0, 0) rotate(0deg)", opacity: 1 },
        {
          transform: `translate(${dx}px, ${dy + 120}px) rotate(${rotation}deg)`,
          opacity: 0,
          offset: 1,
        },
      ],
      { duration, easing: "cubic-bezier(0.25, 0.8, 0.3, 1)", fill: "forwards" }
    );
    animation.onfinish = finish;
  }
}
