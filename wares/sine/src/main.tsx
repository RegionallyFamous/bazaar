import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@bazaar/design/css';
import App            from './App.tsx';

/*
 * CRT / phosphor-green theme.
 * Override --bw-* tokens to match the retro terminal aesthetic, then activate
 * the dark token layer so the design system resets apply.
 */
const root = document.documentElement;
root.setAttribute( 'data-theme', 'dark' );
root.style.setProperty( '--bw-bg',         '#060e09' );
root.style.setProperty( '--bw-surface',    '#0b1a10' );
root.style.setProperty( '--bw-surface-2',  '#0f2218' );
root.style.setProperty( '--bw-border',     '#1a3a28' );
root.style.setProperty( '--bw-text',       '#4ade80' );
root.style.setProperty( '--bw-text-muted', '#86efac' );
root.style.setProperty( '--bw-text-dim',   '#2d6b45' );
root.style.setProperty( '--bw-accent',     '#10b981' );
root.style.setProperty( '--bw-accent-hi',  '#34d399' );
root.style.setProperty( '--bw-accent-bg',  'rgba(16,185,129,.12)' );
root.style.setProperty( '--bw-accent-rgb', '16, 185, 129' );
root.style.setProperty( '--bw-danger',     '#f87171' );

/* Scanline overlay on body — applied here so it survives the base.css reset */
document.body.style.backgroundImage = `repeating-linear-gradient(
  to bottom,
  transparent 0,
  transparent 3px,
  rgba(0,0,0,.08) 3px,
  rgba(0,0,0,.08) 4px
)`;

/* Retro synth uses a monospace font globally */
document.documentElement.style.fontFamily = "'Courier New', 'Lucida Console', monospace";
document.documentElement.style.fontSize   = '12px';

const rootEl = document.getElementById( 'root' );
if ( rootEl ) createRoot( rootEl ).render( <StrictMode><App /></StrictMode> );
