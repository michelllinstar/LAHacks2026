'use client';
import { useEffect, useRef } from 'react';

interface AnimatedLogoProps {
  /** Pixel size of the square stage. Defaults to 56. */
  size?: number;
  className?: string;
}

const MAX_RADIUS = 900;
const EXPAND_MS = 1100;
const FADE_MS = 300;
const ORANGE_OFFSET = 0;

const easeOutQuint = (t: number) => 1 - Math.pow(1 - t, 5);
const easeInQuad = (t: number) => t * t;
const linear = (t: number) => t;

interface Controller {
  cancel: () => void;
}

function tween(
  setter: (v: number) => void,
  fromV: number,
  toV: number,
  duration: number,
  easing: (t: number) => number,
  onComplete?: () => void,
): Controller {
  let startTime: number | null = null;
  let cancelled = false;
  function frame(now: number) {
    if (cancelled) return;
    if (startTime === null) startTime = now;
    const t = Math.min((now - startTime) / duration, 1);
    setter(fromV + (toV - fromV) * easing(t));
    if (t < 1) requestAnimationFrame(frame);
    else if (onComplete) onComplete();
  }
  requestAnimationFrame(frame);
  return { cancel: () => { cancelled = true; } };
}

/**
 * Animated MP logo. On hover, two radial reveal masks expand from the centre —
 * a white wash followed by a warm gold flood — and loop until the cursor
 * leaves. SVG geometry is fixed at viewBox 600×600 and scaled by `size`.
 */
export function AnimatedLogo({ size = 56, className = '' }: AnimatedLogoProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const whiteMaskRef = useRef<SVGRadialGradientElement>(null);
  const orangeMaskRef = useRef<SVGRadialGradientElement>(null);
  const whiteLayerRef = useRef<SVGGElement>(null);
  const orangeLayerRef = useRef<SVGGElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const whiteMask = whiteMaskRef.current!;
    const orangeMask = orangeMaskRef.current!;
    const whiteLayer = whiteLayerRef.current!;
    const orangeLayer = orangeLayerRef.current!;

    const controllers: Record<'white' | 'orange', Controller | null> = {
      white: null,
      orange: null,
    };
    const timers: Record<'white' | 'orange', ReturnType<typeof setTimeout> | null> = {
      white: null,
      orange: null,
    };
    let isHovering = false;

    const clearLayer = (name: 'white' | 'orange') => {
      if (controllers[name]) controllers[name]!.cancel();
      controllers[name] = null;
      if (timers[name]) clearTimeout(timers[name]!);
      timers[name] = null;
    };

    const runCycle = (
      name: 'white' | 'orange',
      mask: SVGRadialGradientElement,
      layer: SVGGElement,
    ) => {
      if (!isHovering) return;
      mask.setAttribute('r', '0');
      layer.setAttribute('opacity', '1');

      controllers[name] = tween(
        (r) => mask.setAttribute('r', String(r)),
        0,
        MAX_RADIUS,
        EXPAND_MS,
        easeOutQuint,
        () => {
          if (!isHovering) return;
          controllers[name] = tween(
            (o) => layer.setAttribute('opacity', String(o)),
            1,
            0,
            FADE_MS,
            linear,
            () => {
              if (isHovering) runCycle(name, mask, layer);
            },
          );
        },
      );
    };

    const startLoops = () => {
      isHovering = true;
      runCycle('white', whiteMask, whiteLayer);
      timers.orange = setTimeout(() => {
        if (isHovering) runCycle('orange', orangeMask, orangeLayer);
      }, ORANGE_OFFSET);
    };

    const stopLoops = () => {
      isHovering = false;
      clearLayer('white');
      clearLayer('orange');

      tween(
        (r) => whiteMask.setAttribute('r', String(r)),
        parseFloat(whiteMask.getAttribute('r') || '0') || 0,
        0,
        350,
        easeInQuad,
        () => whiteLayer.setAttribute('opacity', '1'),
      );
      tween(
        (r) => orangeMask.setAttribute('r', String(r)),
        parseFloat(orangeMask.getAttribute('r') || '0') || 0,
        0,
        300,
        easeInQuad,
        () => orangeLayer.setAttribute('opacity', '1'),
      );
    };

    stage.addEventListener('mouseenter', startLoops);
    stage.addEventListener('mouseleave', stopLoops);
    return () => {
      stage.removeEventListener('mouseenter', startLoops);
      stage.removeEventListener('mouseleave', stopLoops);
      clearLayer('white');
      clearLayer('orange');
    };
  }, []);

  const textProps = {
    x: 300,
    y: 310,
    textAnchor: 'middle' as const,
    dominantBaseline: 'central' as const,
    fontFamily: "'Helvetica Neue', 'Arial Black', 'Inter', 'Segoe UI', sans-serif",
    fontWeight: 900,
    fontSize: 380,
    letterSpacing: '-0.13em',
  };

  return (
    <div
      ref={stageRef}
      className={`inline-block cursor-pointer ${className}`}
      style={{ width: size, height: size }}
    >
      {/* pointerEvents:none lets clicks fall through to a wrapping <Link>
          or <button>; the stage div still receives mouseenter/leave for the
          hover animation because those bubble before being suppressed. */}
      <svg viewBox="0 0 600 600" width="100%" height="100%" style={{ overflow: 'visible', pointerEvents: 'none' }}>
        <defs>
          <radialGradient
            id="al-white-drop-mask"
            ref={whiteMaskRef}
            cx="0"
            cy="0"
            r="0"
            fx="0"
            fy="0"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="white" stopOpacity="1" />
            <stop offset="0.6" stopColor="white" stopOpacity="1" />
            <stop offset="1" stopColor="white" stopOpacity="0" />
          </radialGradient>
          <mask id="al-white-reveal" maskUnits="userSpaceOnUse" x="0" y="0" width="600" height="600">
            <rect x="0" y="0" width="600" height="600" fill="url(#al-white-drop-mask)" />
          </mask>

          <radialGradient
            id="al-orange-drop-mask"
            ref={orangeMaskRef}
            cx="0"
            cy="0"
            r="0"
            fx="0"
            fy="0"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="white" stopOpacity="1" />
            <stop offset="0.7" stopColor="white" stopOpacity="1" />
            <stop offset="1" stopColor="white" stopOpacity="0" />
          </radialGradient>
          <mask id="al-orange-reveal" maskUnits="userSpaceOnUse" x="0" y="0" width="600" height="600">
            <rect x="0" y="0" width="600" height="600" fill="url(#al-orange-drop-mask)" />
          </mask>

          <linearGradient id="al-warm-flood" x1="0" y1="0" x2="600" y2="600" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#E8C547" />
            <stop offset="1" stopColor="#E8C547" />
          </linearGradient>
        </defs>

        <text {...textProps} fill="#E86A2C" style={{ filter: 'drop-shadow(0 6px 14px rgba(232,106,44,0.20))' }}>
          MP
        </text>

        <g ref={whiteLayerRef} mask="url(#al-white-reveal)" opacity="1">
          <text {...textProps} fill="#FFFFFF">MP</text>
        </g>

        <g ref={orangeLayerRef} mask="url(#al-orange-reveal)" opacity="1">
          <text {...textProps} fill="url(#al-warm-flood)">MP</text>
        </g>
      </svg>
    </div>
  );
}
