/**
 * The shape every dashboard tab shares, and small DOM helpers for them.
 *
 * A panel owns one element. The overlay (dashboardOverlay.ts) shows one
 * panel at a time, passes it fresh data, and forwards the keys that move
 * or act on its selection. Panels never listen for keys themselves.
 */
import type { DashboardData } from '../dashboardModel';

export type DashboardTabId = 'navigation' | 'cameras' | 'ship' | 'training';

export interface DashboardPanel {
  readonly id: DashboardTabId;
  /** Tab label. */
  readonly label: string;
  /** Key hints for the footer while this tab shows. */
  readonly hint: string;
  readonly element: HTMLElement;
  /** New live data (the panel keeps its selection where it can). */
  update(data: DashboardData): void;
  /** Move the selection up (-1) or down (+1). */
  move(step: number): void;
  /** Act on the selection (Enter). */
  activate(): void;
  /** The tab has just been brought to the front. */
  show(): void;
}

/** Create an element with an optional class and text. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** A section heading inside a panel. */
export function heading(text: string): HTMLHeadingElement {
  return el('h3', '', text);
}

/** Wrap an index into 0..count-1, both ways. */
export function wrapIndex(index: number, count: number): number {
  return ((index % count) + count) % count;
}
