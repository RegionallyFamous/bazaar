export type CardLabel = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'none';

export interface Card {
  id:          string;
  title:       string;
  description: string;
  label:       CardLabel;
  dueDate:     string; // ISO date string or ''
  createdAt:   number;
}

export interface Column {
  id:    string;
  title: string;
  cards: Card[];
}

export interface BoardState {
  columns: Column[];
}

export const LABEL_COLORS: Record<CardLabel, string> = {
  red:    '#ef4444',
  orange: '#f97316',
  yellow: '#eab308',
  green:  '#22c55e',
  blue:   '#3b82f6',
  purple: '#a855f7',
  none:   'transparent',
};

export const DEFAULT_BOARD: BoardState = {
  columns: [
    { id: 'backlog',     title: 'Backlog',      cards: [] },
    { id: 'todo',        title: 'To Do',         cards: [] },
    { id: 'in-progress', title: 'In Progress',   cards: [] },
    { id: 'done',        title: 'Done',           cards: [] },
  ],
};
