'use client';
import * as React from 'react';

type Tone = 'blue' | 'purple' | 'neutral';

interface GlassBubbleProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  size?: 'sm' | 'md' | 'lg';
  as?: 'span' | 'div';
}

// All tones collapse to one minimal look: neutral white on a glass surface,
// burnt sienna + white glow only emerges on hover. Keeping the tone prop so
// existing call sites still type-check.
const TONE_CLASS: Record<Tone, string> = {
  blue:    'text-white/90 hover:text-white',
  purple:  'text-white/90 hover:text-white',
  neutral: 'text-white/90 hover:text-white',
};

const SIZE_CLASS: Record<NonNullable<GlassBubbleProps['size']>, string> = {
  sm: 'px-4 py-1.5 text-sm gap-1.5',
  md: 'px-5 py-2 text-base gap-2',
  lg: 'px-7 py-3 text-base gap-2.5',
};

export function GlassBubble({
  tone = 'blue',
  size = 'md',
  as = 'span',
  className = '',
  children,
  ...rest
}: GlassBubbleProps) {
  const Tag = as as 'span';
  return (
    <Tag
      {...rest}
      className={[
        'inline-flex items-center justify-center rounded-full',
        'bg-white/[0.04] backdrop-blur-md border border-white/10',
        'transition-all duration-300',
        'hover:bg-white/[0.08] hover:border-white/30',
        'hover:shadow-[0_0_0_1px_rgba(255,255,255,0.18),0_0_28px_rgba(255,255,255,0.18),0_10px_36px_rgba(183,85,58,0.32)]',
        SIZE_CLASS[size],
        TONE_CLASS[tone],
        className,
      ].join(' ')}
    >
      {children}
    </Tag>
  );
}
