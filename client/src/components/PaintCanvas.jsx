import { useRef, useCallback } from 'react';

const ROWS = 8;
const COLS = 16;

export function emptyGrid() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(false));
}

export default function PaintCanvas({ color, grid, editable, onGridChange, small, rowLabels, onNotePlay }) {
  const painting = useRef(false);
  const paintValue = useRef(true);
  const lastPlayedRow = useRef(-1);
  const gridRef = useRef(grid);
  gridRef.current = grid;

  const getCellFromPoint = (x, y) => {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const row = el.dataset.row;
    const col = el.dataset.col;
    if (row == null || col == null) return null;
    return { row: parseInt(row), col: parseInt(col) };
  };

  const paint = useCallback((row, col) => {
    if (!editable || !onGridChange) return;
    const next = gridRef.current.map(r => [...r]);
    next[row][col] = paintValue.current;
    onGridChange(next);
  }, [editable, onGridChange]);

  const handlePointerDown = useCallback((e) => {
    if (!editable) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const cell = getCellFromPoint(e.clientX, e.clientY);
    if (!cell) return;
    painting.current = true;
    paintValue.current = !gridRef.current[cell.row]?.[cell.col];
    paint(cell.row, cell.col);
    if (paintValue.current) {
      onNotePlay?.(cell.row);
      lastPlayedRow.current = cell.row;
    }
  }, [editable, paint, onNotePlay]);

  const handlePointerMove = useCallback((e) => {
    if (!painting.current || !editable) return;
    const cell = getCellFromPoint(e.clientX, e.clientY);
    if (!cell) return;
    paint(cell.row, cell.col);
    if (paintValue.current && cell.row !== lastPlayedRow.current) {
      onNotePlay?.(cell.row);
      lastPlayedRow.current = cell.row;
    }
  }, [editable, paint, onNotePlay]);

  const handlePointerUp = useCallback(() => {
    painting.current = false;
    lastPlayedRow.current = -1;
  }, []);

  const cells = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const painted = grid[row]?.[col];
      cells.push(
        <div
          key={`${row}-${col}`}
          data-row={row}
          data-col={col}
          className={`paint-cell${painted ? ' painted' : ''}${!editable ? ' readonly' : ''}`}
          style={painted ? { backgroundColor: color } : {}}
        />
      );
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: 4 }}>
      {rowLabels && !small && (
        <div style={{ display: 'grid', gridTemplateRows: `repeat(${ROWS}, 1fr)` }}>
          {rowLabels.map((label, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
              fontSize: 9, fontWeight: 700, letterSpacing: '0.3px',
              color: 'var(--muted)', paddingRight: 4, userSelect: 'none',
            }}>
              {label}
            </div>
          ))}
        </div>
      )}
      <div
        className={`paint-grid-wrap${small ? ' mini-canvas' : ''}`}
        style={{ flex: 1 }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <div className="paint-grid">
          {cells}
        </div>
      </div>
    </div>
  );
}
