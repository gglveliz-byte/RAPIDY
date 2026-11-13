/**
 * @archivo src/components/PageTransition.tsx
 * @modulo 00-ui-kernel (Transiciones Ultra-Rápidas entre Vistas)
 * @proposito
 *   Transición fluida y ligera entre rutas para evitar retrasos perceptibles
 *   o pantallas intermedias en blanco. Optimizado para móvil y redes lentas.
 *
 * @resumen_contenido
 *   - Componente `PageTransition`: Envoltorio con micro-animación de opacidad y desplazamiento.
 *
 * @dependencias_externas
 *   - `framer-motion` (`motion`)
 *   - `react` (`ReactNode`)
 */

import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

const pageVariants = {
  initial: {
    opacity: 0.85,
    y: 4,
  },
  in: {
    opacity: 1,
    y: 0,
  },
  out: {
    opacity: 0.85,
    y: -4,
  }
};

const pageTransition = {
  duration: 0.12,
  ease: "easeOut" as const,
};

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

export function PageTransition({ children, className = '' }: PageTransitionProps) {
  return (
    <motion.div
      initial="initial"
      animate="in"
      exit="out"
      variants={pageVariants}
      transition={pageTransition}
      className={`min-h-screen ${className}`}
    >
      {children}
    </motion.div>
  );
}
