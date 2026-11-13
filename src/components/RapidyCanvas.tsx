/**
 * @archivo src/components/RapidyCanvas.tsx
 * @modulo 00-ui-kernel (Efectos Visuales e Identidad Dinámica de Marca)
 * @proposito
 *   Lienzo Canvas HTML5 de alto rendimiento a 60 FPS para fondos interactivos de Rapidy.
 *   Genera constelaciones reactivas con nodos que respiran, trazos de velocidad
 *   subtle delivery y elasticidad física ante movimientos del cursor o eventos táctiles.
 *
 * @resumen_contenido
 *   - Componente `RapidyCanvas`: Inicializa el contexto 2D, calcula densidad de píxeles (DPR)
 *     para pantallas Retina/4K, gestiona el bucle `requestAnimationFrame` y eventos de puntero.
 *   - Interfaces `Particle` y `SpeedStreak`: Modelado físico y cinemático de los nodos y vectores.
 *
 * @dependencias_internas
 *   - Ninguna (Puro Canvas 2D sin bibliotecas externas pesadas).
 *
 * @dependencias_externas
 *   - `react` (`useEffect`, `useRef`)
 *
 * @tablas_bd_o_redis
 *   - Ninguna (Renderizado cliente 100% en GPU/Browser)
 */

import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  baseAlpha: number;
  alpha: number;
  color: string;
  glowColor: string;
  pulseSpeed: number;
  pulsePhase: number;
}

interface SpeedStreak {
  x: number;
  y: number;
  length: number;
  speed: number;
  alpha: number;
  width: number;
}

export default function RapidyCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = window.innerWidth;
    let height = window.innerHeight;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener("resize", resize);

    // Warm Rapidy flame palette
    const colors = [
      { rgb: "255, 106, 0", glow: "rgba(255, 106, 0, 0.8)" },  // Brand Flame Orange
      { rgb: "255, 145, 0", glow: "rgba(255, 145, 0, 0.7)" },  // Amber Glow
      { rgb: "255, 190, 40", glow: "rgba(255, 190, 40, 0.6)" }, // Golden Spark
      { rgb: "255, 70, 0", glow: "rgba(255, 70, 0, 0.8)" },    // Deep Neon Orange
      { rgb: "255, 230, 200", glow: "rgba(255, 200, 160, 0.9)" }, // Starlight White
    ];

    // Constellation particles
    const particleCount = Math.min(Math.floor((width * height) / 10000), 55);
    const particles: Particle[] = [];

    for (let i = 0; i < particleCount; i++) {
      const c = colors[Math.floor(Math.random() * colors.length)];
      const baseAlpha = Math.random() * 0.45 + 0.35;
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.65,
        vy: (Math.random() - 0.5) * 0.65,
        size: Math.random() * 2.5 + 1.2,
        baseAlpha,
        alpha: baseAlpha,
        color: c.rgb,
        glowColor: c.glow,
        pulseSpeed: Math.random() * 0.03 + 0.015,
        pulsePhase: Math.random() * Math.PI * 2,
      });
    }

    // Rapidy speed streaks (subtle diagonal dynamic rays evoking fast delivery)
    const streakCount = 8;
    const streaks: SpeedStreak[] = [];
    for (let i = 0; i < streakCount; i++) {
      streaks.push({
        x: Math.random() * width,
        y: Math.random() * height,
        length: Math.random() * 90 + 40,
        speed: Math.random() * 1.8 + 1.2,
        alpha: Math.random() * 0.15 + 0.05,
        width: Math.random() * 1.5 + 0.6,
      });
    }

    let mouseX = -2000;
    let mouseY = -2000;

    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      const clientX = "touches" in e ? e.touches[0]?.clientX : (e as MouseEvent).clientX;
      const clientY = "touches" in e ? e.touches[0]?.clientY : (e as MouseEvent).clientY;
      if (clientX !== undefined && clientY !== undefined) {
        mouseX = clientX;
        mouseY = clientY;
      }
    };

    const handlePointerLeave = () => {
      mouseX = -2000;
      mouseY = -2000;
    };

    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("touchmove", handlePointerMove, { passive: true });
    window.addEventListener("mouseleave", handlePointerLeave);

    let frame = 0;

    const render = () => {
      frame++;
      ctx.clearRect(0, 0, width, height);

      // 1. Cyber Ambient Radial Flares
      const topRadial = ctx.createRadialGradient(
        width * 0.5,
        height * 0.15,
        10,
        width * 0.5,
        height * 0.15,
        Math.max(width, height) * 0.7
      );
      topRadial.addColorStop(0, "rgba(255, 106, 0, 0.16)");
      topRadial.addColorStop(0.35, "rgba(255, 60, 0, 0.06)");
      topRadial.addColorStop(0.8, "rgba(10, 10, 14, 0)");
      ctx.fillStyle = topRadial;
      ctx.fillRect(0, 0, width, height);

      const bottomRadial = ctx.createRadialGradient(
        width * 0.85,
        height * 0.85,
        10,
        width * 0.85,
        height * 0.85,
        Math.max(width, height) * 0.5
      );
      bottomRadial.addColorStop(0, "rgba(255, 140, 0, 0.08)");
      bottomRadial.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = bottomRadial;
      ctx.fillRect(0, 0, width, height);

      // 2. Dynamic Speed Streaks (Rapidy Delivery Motion)
      ctx.save();
      for (let i = 0; i < streaks.length; i++) {
        const s = streaks[i];
        s.x += s.speed;
        s.y -= s.speed * 0.35; // gentle upward tilt

        if (s.x > width + s.length || s.y < -s.length) {
          s.x = -s.length;
          s.y = Math.random() * height;
        }

        const streakGrad = ctx.createLinearGradient(
          s.x - s.length,
          s.y + s.length * 0.35,
          s.x,
          s.y
        );
        streakGrad.addColorStop(0, "rgba(255, 106, 0, 0)");
        streakGrad.addColorStop(1, `rgba(255, 160, 40, ${s.alpha})`);

        ctx.strokeStyle = streakGrad;
        ctx.lineWidth = s.width;
        ctx.beginPath();
        ctx.moveTo(s.x - s.length, s.y + s.length * 0.35);
        ctx.lineTo(s.x, s.y);
        ctx.stroke();
      }
      ctx.restore();

      // 3. Constellation Connections (Interconnected Mesh)
      const maxDistance = 125;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < maxDistance) {
            const lineAlpha = (1 - dist / maxDistance) * 0.28 * Math.min(particles[i].alpha, particles[j].alpha);
            ctx.beginPath();
            ctx.strokeStyle = `rgba(255, 120, 25, ${lineAlpha})`;
            ctx.lineWidth = 0.9;
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      // 4. Interactive Pointer Constellation Tether
      if (mouseX > 0 && mouseY > 0) {
        for (let i = 0; i < particles.length; i++) {
          const dx = particles[i].x - mouseX;
          const dy = particles[i].y - mouseY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 140) {
            const pointerAlpha = (1 - dist / 140) * 0.4;
            ctx.beginPath();
            ctx.strokeStyle = `rgba(255, 180, 50, ${pointerAlpha})`;
            ctx.lineWidth = 1.1;
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(mouseX, mouseY);
            ctx.stroke();
          }
        }
      }

      // 5. Living Glowing Node Particles
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Breathing pulse
        p.pulsePhase += p.pulseSpeed;
        p.alpha = p.baseAlpha + Math.sin(p.pulsePhase) * 0.22;

        // Interactive pointer repulsion
        const dmx = p.x - mouseX;
        const dmy = p.y - mouseY;
        const mDist = Math.sqrt(dmx * dmx + dmy * dmy);
        if (mDist < 120 && mDist > 0) {
          const force = (1 - mDist / 120) * 1.2;
          p.x += (dmx / mDist) * force;
          p.y += (dmy / mDist) * force;
        }

        // Velocity translation
        p.x += p.vx;
        p.y += p.vy;

        // Wrapping boundaries
        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        // Outer halo glow
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 2.8, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.color}, ${Math.max(0, p.alpha * 0.3)})`;
        ctx.fill();

        // Inner core
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.color}, ${Math.max(0.2, p.alpha)})`;
        ctx.shadowColor = p.glowColor;
        ctx.shadowBlur = p.size * 5;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("touchmove", handlePointerMove);
      window.removeEventListener("mouseleave", handlePointerLeave);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full pointer-events-none z-0"
    />
  );
}
