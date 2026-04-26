'use client';
import * as React from 'react';

type Tone = 'blue' | 'purple' | 'neutral';

interface GlassBubbleProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  size?: 'sm' | 'md' | 'lg';
  as?: 'span' | 'div';
}

const TONE_CLASS: Record<Tone, string> = {
  blue: 'text-[#5EEAD4] shadow-[0_4px_24px_rgba(59,130,246,0.18)] group-hover:border-blue-400/40',
  purple: 'text-purple-400 shadow-[0_4px_24px_rgba(251,191,36,0.18)] group-hover:border-purple-400/40',
  neutral: 'text-white shadow-[0_4px_24px_rgba(255,255,255,0.10)] group-hover:border-white/30',
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
        'bg-white/5 backdrop-blur-md border border-white/10',
        'transition-all hover:bg-white/10',
        SIZE_CLASS[size],
        TONE_CLASS[tone],
        className,
      ].join(' ')}
    >
      {children}
    </Tag>
  );
}
